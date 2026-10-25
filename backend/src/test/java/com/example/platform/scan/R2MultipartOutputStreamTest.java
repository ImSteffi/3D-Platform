package com.example.platform.scan;

import java.io.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class R2MultipartOutputStreamTest {
    final S3Client r2 = mock(S3Client.class);
    R2MultipartOutputStream stream() {
        when(r2.createMultipartUpload(any(CreateMultipartUploadRequest.class)))
                .thenReturn(CreateMultipartUploadResponse.builder().uploadId("upload").build());
        return new R2MultipartOutputStream(r2, "bucket", "temporary-exports/test.zip", 5);
    }

    @Test void streamsExactBytesInBoundedPartsThenCompletes() throws Exception {
        var output = stream();
        var received = new ByteArrayOutputStream();
        when(r2.uploadPart(any(UploadPartRequest.class), any(RequestBody.class))).thenAnswer(call -> {
            var request = call.getArgument(0, UploadPartRequest.class);
            var body = call.getArgument(1, RequestBody.class);
            try (var input = body.contentStreamProvider().newStream()) { input.transferTo(received); }
            assertTrue(request.contentLength() <= 5);
            return UploadPartResponse.builder().eTag("etag-" + request.partNumber()).build();
        });
        var bytes = new byte[]{1,2,3,4,5,6,7,8,9,10,11};
        try (output) {
            output.write(bytes, 0, 7);
            output.write(bytes, 7, 4);
            output.complete();
        }
        assertArrayEquals(bytes, received.toByteArray());
        var completion = org.mockito.ArgumentCaptor.forClass(CompleteMultipartUploadRequest.class);
        verify(r2).completeMultipartUpload(completion.capture());
        assertEquals(3, completion.getValue().multipartUpload().parts().size());
        verify(r2, never()).abortMultipartUpload(any(AbortMultipartUploadRequest.class));
    }

    @Test void failedPartAbortsAndNeverCompletes() {
        var output = stream();
        when(r2.uploadPart(any(UploadPartRequest.class), any(RequestBody.class)))
                .thenThrow(S3Exception.builder().statusCode(503).build());
        assertThrows(S3Exception.class, () -> { try (output) { output.write(new byte[12]); output.complete(); } });
        verify(r2).abortMultipartUpload(AbortMultipartUploadRequest.builder().bucket("bucket")
                .key("temporary-exports/test.zip").uploadId("upload").build());
        verify(r2, never()).completeMultipartUpload(any(CompleteMultipartUploadRequest.class));
    }

    @Test void closingAnIncompleteZipAbortsEvenBeforeFirstPart() {
        try (var output = stream()) { /* ZIP creation failed before bytes arrived. */ }
        verify(r2).abortMultipartUpload(any(AbortMultipartUploadRequest.class));
        verify(r2, never()).completeMultipartUpload(any(CompleteMultipartUploadRequest.class));
    }
}