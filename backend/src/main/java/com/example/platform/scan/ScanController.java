package com.example.platform.scan;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/organizations/{organizationId}/projects/{projectId}/scans")
public class ScanController {

    private final ScanService scanService;

    public ScanController(ScanService scanService) {
        this.scanService = scanService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ScanService.ScanResponse create(
            @PathVariable Long organizationId,
            @PathVariable Long projectId,
            @Valid @RequestBody CreateScanRequest request) {

        var files = request.files().stream()
                .map(file -> new ScanService.FileInput(
                        file.relativePath(),
                        file.sizeBytes()))
                .toList();

        return scanService.create(
                organizationId,
                projectId,
                request.name(),
                files);
    }

    public record CreateScanRequest(
            @NotBlank @Size(max = 200) String name,
            @NotEmpty List<@NotNull @Valid FileRequest> files) {
    }

    public record FileRequest(
            @NotBlank @Size(max = 1000) String relativePath,
            @NotNull @PositiveOrZero Long sizeBytes) {
    }
}