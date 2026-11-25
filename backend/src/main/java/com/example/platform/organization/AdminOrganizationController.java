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
    private final OrganizationRemovalService removal;

    public AdminOrganizationController(OrganizationRepository organizations, OrganizationRemovalService removal) {
        this.organizations = organizations;
        this.removal = removal;
    }

    /** What deleting the organization would remove, shown before the team confirms. */
    @GetMapping("/{id}/removal")
    public OrganizationRemovalService.Removal removal(@PathVariable Long id) {
        return removal.preview(id);
    }

    /** Deletes the organization, its people, their spaces and every file of them. Cannot be undone. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        removal.delete(id);
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
