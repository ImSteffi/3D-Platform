package com.example.platform.scan;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;

import com.example.platform.project.ProjectRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ScanService {

    private final ProjectRepository projectRepository;
    private final ScanRepository scanRepository;
    private final ScanFileRepository scanFileRepository;

    public ScanService(
            ProjectRepository projectRepository,
            ScanRepository scanRepository,
            ScanFileRepository scanFileRepository) {

        this.projectRepository = projectRepository;
        this.scanRepository = scanRepository;
        this.scanFileRepository = scanFileRepository;
    }

    @Transactional
    public ScanResponse create(
            Long organizationId,
            Long projectId,
            String name,
            List<FileInput> files) {

        var project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Project not found"));

        if (!project.getOrganization().getId().equals(organizationId)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Project not found");
        }

        if (name == null || name.isBlank() || name.length() > 200) {
            throw badRequest("Enter a scan name of 1–200 characters.");
        }

        if (files == null || files.isEmpty()) {
            throw badRequest("Select at least one file.");
        }

        var paths = new HashSet<String>();

        for (var file : files) {
            if (file == null) {
                throw badRequest("Invalid file.");
            }

            validatePath(file.relativePath());

            if (file.sizeBytes() < 0 || file.sizeBytes() > 5L * 1024 * 1024 * 1024 * 1024) {
                throw badRequest("File size must be between zero and 5 TiB.");
            }

            if (!paths.add(file.relativePath())) {
                throw badRequest("Duplicate file path.");
            }
        }

        var scan = scanRepository.save(
                new Scan(project, name.trim()));

        var savedFiles = files.stream()
                .map(file -> {
                    var objectKey = "projects/" + projectId
                            + "/scans/" + scan.getId()
                            + "/" + file.relativePath();

                    if (objectKey.length() > 1000
                            || objectKey.getBytes(
                                    StandardCharsets.UTF_8).length > 1024) {
                        throw badRequest("File path is too long.");
                    }

                    return scanFileRepository.save(new ScanFile(
                            scan,
                            file.relativePath(),
                            objectKey,
                            file.sizeBytes()));
                })
                .map(file -> new FileResponse(
                        file.getId(),
                        file.getRelativePath(),
                        file.getSizeBytes()))
                .toList();

        return new ScanResponse(
                scan.getId(),
                projectId,
                scan.getName(),
                scan.getStatus().name(),
                savedFiles);
    }

    private void validatePath(String path) {
        if (path == null || path.isBlank()
                || path.length() > 1000
                || path.startsWith("/")
                || path.contains("\\")
                || path.chars().anyMatch(Character::isISOControl)) {
            throw badRequest("Invalid file path.");
        }

        for (var segment : path.split("/", -1)) {
            if (segment.isBlank()
                    || segment.equals(".")
                    || segment.equals("..")) {
                throw badRequest("Invalid file path.");
            }
        }
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST, message);
    }

    public record FileInput(
            String relativePath,
            long sizeBytes) {
    }

    public record FileResponse(
            Long id,
            String relativePath,
            long sizeBytes) {
    }

    public record ScanResponse(
            Long id,
            Long projectId,
            String name,
            String status,
            List<FileResponse> files) {
    }
}