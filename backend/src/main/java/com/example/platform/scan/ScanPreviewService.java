package com.example.platform.scan;

import java.io.*;
import javax.imageio.ImageIO;
import com.example.platform.user.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

@Service
public class ScanPreviewService {
    static final int MAX_BYTES = 4 * 1024 * 1024;
    private final ScanViewerService viewer;
    private final ScanRepository scans;
    private final UserRepository users;
    private final S3Client r2;
    private final String bucket;

    public ScanPreviewService(ScanViewerService viewer, ScanRepository scans, UserRepository users,
            S3Client r2, @Value("${storage.r2.bucket-name}") String bucket) {
        this.viewer = viewer; this.scans = scans; this.users = users; this.r2 = r2; this.bucket = bucket;
    }

    static String key(Long id) { return "viewer-previews/scans/" + id + "/preview.png"; }

    @Transactional(readOnly = true)
    public byte[] get(Long id, Authentication authentication) {
        viewer.accessibleScan(id, authentication);
        try (var input = r2.getObject(GetObjectRequest.builder().bucket(bucket).key(key(id)).build())) {
            return input.readNBytes(MAX_BYTES + 1);
        } catch (S3Exception error) {
            if (error.statusCode() == 404) return null;
            throw error;
        } catch (IOException error) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY); }
    }

    @Transactional
    public void save(Long id, InputStream input, Authentication authentication) throws IOException {
        if (authentication == null || users.findByEmailIgnoreCase(authentication.getName())
                .filter(user -> user.isPlatformAdmin()).isEmpty())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        // Serialize preview writes with deletion so no preview is left behind.
        scans.findForUpdate(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        viewer.accessibleScan(id, authentication);
        var bytes = input.readNBytes(MAX_BYTES + 1);
        if (bytes.length > MAX_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        var normalized = normalize(bytes);
        r2.putObject(PutObjectRequest.builder().bucket(bucket).key(key(id))
                .contentType("image/png").cacheControl("no-store").build(), RequestBody.fromBytes(normalized));
    }

    static byte[] normalize(byte[] bytes) {
        try (var imageInput = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(imageInput);
            if (!readers.hasNext()) throw new IOException();
            var reader = readers.next();
            try {
                reader.setInput(imageInput);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (!reader.getFormatName().equalsIgnoreCase("png") || width < 1 || height < 1
                        || width > 2048 || height > 2048) throw new IOException();
                var image = reader.read(0);
                var output = new ByteArrayOutputStream();
                ImageIO.write(image, "png", output);
                if (output.size() > MAX_BYTES) throw new IOException();
                return output.toByteArray();
            } finally { reader.dispose(); }
        } catch (IOException | RuntimeException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid preview image.");
        }
    }
}