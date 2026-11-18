package com.example.platform.organization;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Admin only (/api/admin/**): changes to a customer. */
@RestController
@RequestMapping("/api/admin/organizations")
public class AdminOrganizationController {

    private final OrganizationRepository organizations;

    public AdminOrganizationController(OrganizationRepository organizations) {
        this.organizations = organizations;
    }

    @PutMapping("/{id}")
    @Transactional
    public OrganizationController.OrganizationResponse rename(@PathVariable Long id, @Valid @RequestBody Rename request) {
        var organization = organizations.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer not found."));
        organization.rename(request.name().strip());
        return new OrganizationController.OrganizationResponse(organization.getId(), organization.getName());
    }

    public record Rename(@NotBlank @Size(max = 200) String name) {
    }
}
