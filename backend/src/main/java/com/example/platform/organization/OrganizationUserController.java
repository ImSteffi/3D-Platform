package com.example.platform.organization;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/organizations/{organizationId}/users")
public class OrganizationUserController {

    private final OrganizationUserService userService;

    public OrganizationUserController(OrganizationUserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public List<OrganizationUserService.UserResponse> list(
            @PathVariable("organizationId") Long organizationId) {
        return userService.list(organizationId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrganizationUserService.UserResponse create(
            @PathVariable("organizationId") Long organizationId,
            @Valid @RequestBody CreateUserRequest request) {

        return userService.create(
                organizationId,
                request.displayName(),
                request.email(),
                request.password());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public Map<String, String> handleDataConflict() {
        return Map.of(
                "message", "User data conflicts with an existing record");
    }

    public record CreateUserRequest(
            @NotBlank @Size(max = 200) String displayName,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank String password) {
    }
}