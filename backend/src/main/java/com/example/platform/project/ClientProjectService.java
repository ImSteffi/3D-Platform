package com.example.platform.project;

import java.util.List;
import com.example.platform.scan.Scan;
import com.example.platform.scan.ScanRepository;
import com.example.platform.scan.ScanFileRepository;
import com.example.platform.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class ClientProjectService {
    private final ProjectRepository projects;
    private final UserRepository users;
    private final ScanRepository scans;
    private final ScanFileRepository files;

    public ClientProjectService(ProjectRepository projects, UserRepository users,
            ScanRepository scans, ScanFileRepository files) {
        this.projects = projects;
        this.users = users;
        this.scans = scans;
        this.files = files;
    }

    private Long userId(String email) {
        return users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED)).getId();
    }

    public List<ProjectSummary> list(String email) {
        return projects.findAccessibleProjects(userId(email)).stream().map(p ->
                new ProjectSummary(p.getId(), p.getName(), p.getOrganization().getId(),
                        p.getOrganization().getName(),
                        scans.countByProject_IdAndStatus(p.getId(), Scan.Status.READY)))
                .toList();
    }

    public ProjectDetail detail(String email, Long projectId) {
        // Membership is part of the query, so another organization's ID returns 404.
        var project = projects.findAccessibleProject(userId(email), projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        var published = scans.findByProject_IdAndStatusOrderByIdAsc(projectId, Scan.Status.READY)
                .stream().map(scan -> {
                    var entries = files.findByScan_IdOrderByIdAsc(scan.getId());
                    return new PublishedScan(scan.getId(), scan.getName(), entries.size(),
                            entries.stream().mapToLong(f -> f.getSizeBytes()).sum(),
                            entries.stream().map(f -> new PublishedFile(f.getRelativePath(), f.getSizeBytes())).toList());
                }).toList();
        return new ProjectDetail(project.getId(), project.getName(),
                project.getOrganization().getName(), published);
    }

    public record ProjectSummary(Long id, String name, Long organizationId,
            String organizationName, long publishedScanCount) {}
    public record PublishedFile(String relativePath, long sizeBytes) {}
    public record PublishedScan(Long id, String name, int fileCount, long sizeBytes, List<PublishedFile> files) {}
    public record ProjectDetail(Long id, String name, String organizationName,
            List<PublishedScan> scans) {}
}
