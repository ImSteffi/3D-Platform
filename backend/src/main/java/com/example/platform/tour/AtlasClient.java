package com.example.platform.tour;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Minimal client for the World Labs Atlas API (docs.atlas.worldlabs.ai): private asset upload,
 * the images2PosedRGBD task, operation polling and output download. The key comes from the
 * WLT_API_KEY environment variable and is only sent to the API itself, never to signed URLs.
 */
@Component
public class AtlasClient {
    static final JsonMapper JSON = JsonMapper.builder().build();
    // Headers java.net.http sets itself and refuses to accept.
    private static final Set<String> RESTRICTED = Set.of("host", "content-length", "connection", "expect", "upgrade");

    private final String apiKey;
    private final String baseUrl;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public AtlasClient(@Value("${WLT_API_KEY:}") String apiKey,
            @Value("${WLT_API_BASE_URL:https://api.atlas.worldlabs.ai/api/v2}") String baseUrl) {
        this.apiKey = apiKey == null ? "" : apiKey.strip();
        var base = baseUrl == null || baseUrl.isBlank() ? "https://api.atlas.worldlabs.ai/api/v2" : baseUrl.strip();
        this.baseUrl = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    public boolean configured() {
        return !apiKey.isEmpty();
    }

    /** Uploads bytes as a private project asset and returns its id once it is READY. */
    public String uploadAsset(String displayName, String contentType, byte[] bytes) {
        var create = JSON.createObjectNode();
        create.putObject("asset").put("displayName", displayName);
        var asset = post("/assets", create, null);
        var id = text(asset, "id");
        if (id == null) id = text(asset.path("asset"), "id");
        if (id == null) throw new AtlasException("Atlas did not return an asset id.");

        var request = JSON.createObjectNode();
        request.put("contentType", contentType);
        request.put("contentLength", bytes.length);
        var grant = post("/assets/" + id + ":createUploadUrl", request, null);
        var uploadUrl = text(grant, "uploadUrl");
        if (uploadUrl == null) throw new AtlasException("Atlas did not return an upload URL.");
        var method = text(grant, "method") == null ? "PUT" : text(grant, "method");

        // Signed URL: no API key here.
        var put = HttpRequest.newBuilder(URI.create(uploadUrl)).timeout(Duration.ofMinutes(5))
                .method(method, HttpRequest.BodyPublishers.ofByteArray(bytes));
        boolean typed = false;
        for (var header : grant.path("headers").properties()) {
            if (RESTRICTED.contains(header.getKey().toLowerCase())) continue;
            if (header.getKey().equalsIgnoreCase("content-type")) typed = true;
            put.header(header.getKey(), header.getValue().asString());
        }
        if (!typed) put.header("Content-Type", contentType);
        var uploaded = send(put.build());
        if (uploaded.statusCode() / 100 != 2)
            throw new AtlasException("Uploading a photo to Atlas failed (HTTP " + uploaded.statusCode() + ").");

        post("/assets/" + id + ":completeUpload", JSON.createObjectNode(), null);
        return id;
    }

    /** Submits images2PosedRGBD and returns the operation id. */
    public String submitPosedRgbd(Iterable<String> assetIds, String idempotencyKey) {
        var body = JSON.createObjectNode();
        var frames = body.putArray("frames");
        for (var id : assetIds) frames.addObject().putObject("imageAsset").put("assetId", id);
        body.put("canonicalizeToFirstFrame", true);
        var operation = post("/tasks:images2PosedRGBD", body, idempotencyKey);
        var id = text(operation, "id");
        if (id == null) throw new AtlasException("Atlas did not return an operation id.");
        return id;
    }

    /**
     * Submits posedImages2Splats (a 3D Gaussian splat from posed RGB-D frames) and returns the operation id.
     * Each frame is {imageAsset, camera, depth: {depthAsset, confidenceAsset}}, as images2PosedRGBD returns them.
     */
    public String submitSplats(tools.jackson.databind.node.ArrayNode posedFrames, String idempotencyKey) {
        var body = JSON.createObjectNode();
        body.set("posedFrames", posedFrames);
        var operation = post("/tasks:posedImages2Splats", body, idempotencyKey);
        var id = text(operation, "id");
        if (id == null) throw new AtlasException("Atlas did not return an operation id.");
        return id;
    }

    /** Downloads an output asset straight into a file, so large outputs (a 3DGS) never sit in memory. */
    public void downloadTo(JsonNode assetRef, java.nio.file.Path target) {
        var url = text(assetRef, "url");
        if (url != null) {
            var response = sendFile(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMinutes(15)).GET().build(), target);
            if (response.statusCode() / 100 == 2) return;
        }
        var id = text(assetRef, "assetId");
        if (id == null) throw new AtlasException("Atlas returned an output without an asset id.");
        var readUrl = text(post("/assets/" + id + ":createReadUrl", JSON.createObjectNode(), null), "readUrl");
        if (readUrl == null) throw new AtlasException("Atlas did not return a read URL.");
        var response = sendFile(HttpRequest.newBuilder(URI.create(readUrl)).timeout(Duration.ofMinutes(15)).GET().build(), target);
        if (response.statusCode() / 100 != 2)
            throw new AtlasException("Downloading an Atlas output failed (HTTP " + response.statusCode() + ").");
    }

    private HttpResponse<java.nio.file.Path> sendFile(HttpRequest request, java.nio.file.Path target) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofFile(target));
        } catch (IOException error) {
            throw new AtlasException("Could not download from Atlas: " + error.getMessage());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AtlasException("Interrupted while downloading from Atlas.");
        }
    }

    public JsonNode operation(String id) {
        return read(withKey(HttpRequest.newBuilder(URI.create(baseUrl + "/operations/" + id)).GET()).build());
    }

    /** Downloads an output asset: its direct URL while valid, else a fresh read URL. */
    public byte[] download(JsonNode assetRef) {
        var url = text(assetRef, "url");
        if (url != null) {
            var response = sendBytes(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMinutes(5)).GET().build());
            if (response.statusCode() / 100 == 2) return response.body();
        }
        var id = text(assetRef, "assetId");
        if (id == null) throw new AtlasException("Atlas returned an output without an asset id.");
        var readUrl = text(post("/assets/" + id + ":createReadUrl", JSON.createObjectNode(), null), "readUrl");
        if (readUrl == null) throw new AtlasException("Atlas did not return a read URL.");
        var response = sendBytes(HttpRequest.newBuilder(URI.create(readUrl)).timeout(Duration.ofMinutes(5)).GET().build());
        if (response.statusCode() / 100 != 2)
            throw new AtlasException("Downloading an Atlas output failed (HTTP " + response.statusCode() + ").");
        return response.body();
    }

    private JsonNode post(String path, ObjectNode body, String idempotencyKey) {
        var request = withKey(HttpRequest.newBuilder(URI.create(baseUrl + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body))));
        if (idempotencyKey != null) request.header("Idempotency-Key", idempotencyKey);
        return read(request.build());
    }

    private HttpRequest.Builder withKey(HttpRequest.Builder builder) {
        if (!configured()) throw new AtlasException("WLT_API_KEY is not set on the server.");
        return builder.timeout(Duration.ofSeconds(60)).header("WLT-Api-Key", apiKey).header("Accept", "application/json");
    }

    private JsonNode read(HttpRequest request) {
        var response = send(request);
        JsonNode body;
        try {
            body = response.body() == null || response.body().isBlank() ? JSON.createObjectNode() : JSON.readTree(response.body());
        } catch (RuntimeException notJson) {
            body = JSON.createObjectNode();
        }
        if (response.statusCode() / 100 != 2) {
            var message = text(body.path("error"), "message");
            if (message == null) message = text(body, "message");
            if (message == null) message = text(body, "detail");
            throw new AtlasException("Atlas request failed (HTTP " + response.statusCode() + ")"
                    + (message == null ? "." : ": " + message));
        }
        return body;
    }

    private HttpResponse<String> send(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException error) {
            throw new AtlasException("Could not reach Atlas: " + error.getMessage());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AtlasException("Interrupted while calling Atlas.");
        }
    }

    private HttpResponse<byte[]> sendBytes(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException error) {
            throw new AtlasException("Could not download from Atlas: " + error.getMessage());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AtlasException("Interrupted while downloading from Atlas.");
        }
    }

    static String text(JsonNode node, String field) {
        var value = node == null ? null : node.get(field);
        return value == null || value.isNull() || !value.isValueNode() ? null : value.asString();
    }

    public static class AtlasException extends RuntimeException {
        public AtlasException(String message) { super(message); }
    }
}
