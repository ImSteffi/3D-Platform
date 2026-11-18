package com.example.platform.organization;

import com.example.platform.user.User;
import com.example.platform.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

@Service
public class OrganizationUserService {

    private final OrganizationRepository organizationRepository;
    private final OrganizationMembershipRepository membershipRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public OrganizationUserService(
            OrganizationRepository organizationRepository,
            OrganizationMembershipRepository membershipRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder) {
        this.organizationRepository = organizationRepository;
        this.membershipRepository = membershipRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<UserResponse> list(Long organizationId) {
        if (!organizationRepository.existsById(organizationId)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Organization not found");
        }

        return membershipRepository
                .findByOrganization_IdOrderByIdAsc(organizationId)
                .stream()
                .map(membership -> toResponse(membership, organizationId))
                .toList();
    }

    @Transactional
    public UserResponse create(
            Long organizationId,
            String displayName,
            String email,
            String password) {

        var organization = organizationRepository.findById(organizationId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Organization not found"));

        var normalizedEmail = email.strip().toLowerCase(Locale.ROOT);

        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Email already exists");
        }

        if (password.length() < 8) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "The password needs at least 8 characters.");
        }

        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Password exceeds the bcrypt limit of 72 bytes");
        }

        var user = new User(
                displayName.strip(),
                normalizedEmail,
                passwordEncoder.encode(password));

        var savedUser = userRepository.saveAndFlush(user);

        var membership = new OrganizationMembership(
                organization, savedUser);

        var savedMembership = membershipRepository.saveAndFlush(membership);

        return toResponse(savedMembership, organizationId);
    }

    private UserResponse toResponse(
            OrganizationMembership membership,
            Long organizationId) {

        var user = membership.getUser();

        return new UserResponse(
                user.getId(),
                organizationId,
                user.getDisplayName(),
                user.getEmail(),
                membership.getRole());
    }

    public record UserResponse(
            Long id,
            Long organizationId,
            String displayName,
            String email,
            String role) {
    }
}