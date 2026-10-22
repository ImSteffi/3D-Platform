package com.example.platform.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken csrfToken) {
        return new CsrfResponse(
                csrfToken.getHeaderName(),
                csrfToken.getToken());
    }

    @GetMapping("/me")
    public CurrentUserResponse currentUser(Authentication authentication) {
        return new CurrentUserResponse(authentication.getName());
    }

    public record CsrfResponse(String headerName, String token) {
    }

    public record CurrentUserResponse(String username) {
    }
}