package com.example.platform.auth;

import com.example.platform.organization.OrganizationMembershipRepository;
import java.util.List;

import com.example.platform.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final OrganizationMembershipRepository membershipRepository;

    public AuthController(
            UserRepository userRepository,
            OrganizationMembershipRepository membershipRepository) {
        this.userRepository = userRepository;
        this.membershipRepository = membershipRepository;
    }

    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken csrfToken) {
        return new CsrfResponse(
                csrfToken.getHeaderName(),
                csrfToken.getToken());
    }

    @GetMapping("/me")
    public CurrentUserResponse currentUser(Authentication authentication) {
        var user = userRepository
                .findByEmailIgnoreCase(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        return new CurrentUserResponse(
                user.getDisplayName(),
                user.getEmail(),
                user.isPlatformAdmin(),
                membershipRepository.findOrganizationNamesByUserId(user.getId()));
    }

    public record CsrfResponse(String headerName, String token) {
    }

    public record CurrentUserResponse(
            String displayName,
            String email,
            boolean platformAdmin,
            List<String> organizationNames) {
    }
}