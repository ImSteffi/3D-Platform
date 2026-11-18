package com.example.platform.user;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

/**
 * The team: everyone who works in the platform as an admin. Every admin sees the list;
 * only the owner adds or removes admins, and the owner can never be removed.
 */
@RestController
@RequestMapping("/api/admin/team")
public class AdminTeamController {

    private final UserRepository users;
    private final PasswordEncoder passwords;

    public AdminTeamController(UserRepository users, PasswordEncoder passwords) {
        this.users = users;
        this.passwords = passwords;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<Member> list() {
        return users.findByPlatformAdminTrueOrderByIdAsc().stream().map(Member::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Member add(@Valid @RequestBody NewMember request, Authentication authentication) {
        owner(authentication);
        var email = request.email().strip().toLowerCase(Locale.ROOT);
        if (users.existsByEmailIgnoreCase(email))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Someone already signs in with this email.");
        if (request.password().length() < 8)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The password needs at least 8 characters.");
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The password is too long.");
        return Member.of(users.saveAndFlush(User.admin(request.displayName().strip(), email, passwords.encode(request.password()))));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void remove(@PathVariable Long id, Authentication authentication) {
        var me = owner(authentication);
        var target = users.findById(id).filter(User::isPlatformAdmin)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Admin not found."));
        if (target.isOwner() || target.getId().equals(me.getId()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "The owner cannot be removed.");
        try {
            users.delete(target);
            users.flush();
        } catch (DataIntegrityViolationException stillLinked) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This admin is still linked to other records.");
        }
    }

    private User owner(Authentication authentication) {
        var user = users.findByEmailIgnoreCase(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!user.isOwner())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can change the team.");
        return user;
    }

    public record Member(Long id, String displayName, String email, boolean owner) {
        static Member of(User user) {
            return new Member(user.getId(), user.getDisplayName(), user.getEmail(), user.isOwner());
        }
    }

    public record NewMember(
            @NotBlank @Size(max = 200) String displayName,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank String password) {
    }
}
