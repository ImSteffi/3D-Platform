package com.example.platform.scan;

import java.io.*;
import java.util.*;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

/** A bounded buffer: a ZIP is uploaded one part at a time, never kept whole in memory. */
final class R2MultipartOutputStream extends OutputStream {
    private final S3Client r2;
    private final String bucket, key, uploadId;
    private final byte[] buffer;
    private final List<CompletedPart> parts = new ArrayList<>();
    private int used;
    private boolean completed, closed;

    R2MultipartOutputStream(S3Client r2, String bucket, String key) {
        this(r2, bucket, key, 8 * 1024 * 1024);
    }

    R2MultipartOutputStream(S3Client r2, String bucket, String key, int partSize) {
        this.r2 = r2; this.bucket = bucket; this.key = key;
        buffer = new byte[partSize];
        uploadId = r2.createMultipartUpload(CreateMultipartUploadRequest.builder().bucket(bucket).key(key)
                .contentType("application/zip").contentDisposition("attachment; filename=\"3D-viewer.zip\"")
                .cacheControl("no-store").build()).uploadId();
    }

    @Override public void write(int value) throws IOException {
        ensureOpen();
        buffer[used++] = (byte) value;
        if (used == buffer.length) uploadPart();
    }

    @Override public void write(byte[] bytes, int offset, int length) throws IOException {
        Objects.checkFromIndexSize(offset, length, bytes.length);
        ensureOpen();
        while (length > 0) {
            if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Export interrupted.");
            int count = Math.min(length, buffer.length - used);
            System.arraycopy(bytes, offset, buffer, used, count);
            used += count; offset += count; length -= count;
            if (used == buffer.length) uploadPart();
        }
    }

    private void ensureOpen() throws IOException {
        if (closed || completed) throw new IOException("Export stream is closed.");
    }

    private void uploadPart() throws IOException {
        if (used == 0) return;
        if (parts.size() >= 10000) throw new IOException("Export exceeds multipart size limit.");
        int number = parts.size() + 1;
        var result = r2.uploadPart(UploadPartRequest.builder().bucket(bucket).key(key)
                .uploadId(uploadId).partNumber(number).contentLength((long) used).build(),
                RequestBody.fromInputStream(new ByteArrayInputStream(buffer, 0, used), used));
        parts.add(CompletedPart.builder().partNumber(number).eTag(result.eTag()).build());
        used = 0;
    }

    void complete() throws IOException {
        ensureOpen();
        uploadPart();
        r2.completeMultipartUpload(CompleteMultipartUploadRequest.builder().bucket(bucket).key(key)
                .uploadId(uploadId).multipartUpload(CompletedMultipartUpload.builder().parts(parts).build()).build());
        completed = true;
    }

    @Override public void close() {
        if (closed) return;
        closed = true;
        if (!completed) r2.abortMultipartUpload(AbortMultipartUploadRequest.builder()
                .bucket(bucket).key(key).uploadId(uploadId).build());
    }
}