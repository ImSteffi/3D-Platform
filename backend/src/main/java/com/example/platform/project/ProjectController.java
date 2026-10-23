package com.example.platform.project;

import java.util.List;

import com.example.platform.organization.OrganizationRepository;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/organizations/{organizationId}/projects")
public class ProjectController {

        private final ProjectRepository projectRepository;
        private final OrganizationRepository organizationRepository;

        public ProjectController(
                        ProjectRepository projectRepository,
                        OrganizationRepository organizationRepository) {

                this.projectRepository = projectRepository;
                this.organizationRepository = organizationRepository;
        }

        @GetMapping
        @Transactional(readOnly = true)
        public List<ProjectResponse> list(
                        @PathVariable Long organizationId) {

                if (!organizationRepository.existsById(organizationId)) {
                        throw new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "Organization not found");
                }

                return projectRepository
                                .findByOrganization_IdOrderByIdAsc(organizationId)
                                .stream()
                                .map(project -> new ProjectResponse(
                                                project.getId(),
                                                organizationId,
                                                project.getName()))
                                .toList();
        }

        @PostMapping
        @ResponseStatus(HttpStatus.CREATED)
        @Transactional
        public ProjectResponse create(
                        @PathVariable Long organizationId,
                        @Valid @RequestBody CreateProjectRequest request) {

                var organization = organizationRepository
                                .findById(organizationId)
                                .orElseThrow(() -> new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Organization not found"));

                var project = new Project(
                                organization,
                                request.name().trim());

                var saved = projectRepository.save(project);

                return new ProjectResponse(
                                saved.getId(),
                                organizationId,
                                saved.getName());
        }

        public record CreateProjectRequest(
                        @NotBlank @Size(max = 200) String name) {
        }

        public record ProjectResponse(
                        Long id,
                        Long organizationId,
                        String name) {
        }
}