package com.example.platform.organization;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/organizations")
public class OrganizationController {

    private final OrganizationRepository organizationRepository;

    public OrganizationController(
            OrganizationRepository organizationRepository) {
        this.organizationRepository = organizationRepository;
    }

    @GetMapping
    public List<OrganizationResponse> list() {
        return organizationRepository
                .findAll(Sort.by("id").ascending())
                .stream()
                .map(organization -> new OrganizationResponse(
                        organization.getId(),
                        organization.getName()))
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrganizationResponse create(
            @Valid @RequestBody CreateOrganizationRequest request) {

        var organization = new Organization(request.name().trim());
        var saved = organizationRepository.save(organization);

        return new OrganizationResponse(
                saved.getId(),
                saved.getName());
    }

    public record CreateOrganizationRequest(
            @NotBlank @Size(max = 200) String name) {
    }

    public record OrganizationResponse(Long id, String name) {
    }
}