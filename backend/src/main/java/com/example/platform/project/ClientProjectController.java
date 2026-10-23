package com.example.platform.project;

import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/client/projects")
public class ClientProjectController {
    private final ClientProjectService projects;
    public ClientProjectController(ClientProjectService projects) { this.projects = projects; }

    @GetMapping
    public List<ClientProjectService.ProjectSummary> list(Authentication authentication) {
        return projects.list(authentication.getName());
    }

    @GetMapping("/{projectId}")
    public ClientProjectService.ProjectDetail detail(Authentication authentication,
            @PathVariable Long projectId) {
        return projects.detail(authentication.getName(), projectId);
    }
}
