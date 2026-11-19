package com.example.platform.tour;

import com.example.platform.organization.OrganizationMembershipRepository;
import com.example.platform.user.User;
import com.example.platform.user.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Admin only (/api/admin/**): change or remove a customer's account. Admins themselves are managed on the
 * Team list instead, so these refuse them. A removed customer's spaces go to a colleague in the same
 * organization; with no colleague the removal is refused, so spaces never disappear by accident.
 */
@RestController
@RequestMapping("/api/admin/customers")
public class AdminCustomerController {

    private final UserRepository users;
    private final OrganizationMembershipRepository memberships;
    private final TourRequestRepository tours;
    private final PasswordEncoder passwords;

    public AdminCustomerController(UserRepository users, OrganizationMembershipRepository memberships,
            TourRequestRepository tours, PasswordEncoder passwords) {
        this.users = users;
        this.memberships = memberships;
        this.tours = tours;
        this.passwords = passwords;
    }

    @PutMapping("/{id}")
    @Transactional
    public Account update(@PathVariable Long id, @Valid @RequestBody Changes changes) {
        var customer = customer(id);
        var email = changes.email().strip().toLowerCase(Locale.ROOT);
        if (!email.equalsIgnoreCase(customer.getEmail()) && users.existsByEmailIgnoreCase(email))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Someone already signs in with this email.");
        customer.setDisplayName(changes.displayName().strip());
        customer.setEmail(email);
        var password = changes.password();
        if (password != null && !password.isEmpty()) {
            if (password.length() < 8)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The password needs at least 8 characters.");
            if (password.getBytes(StandardCharsets.UTF_8).length > 72)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The password is too long.");
            customer.setPasswordHash(passwords.encode(password));
        }
        return new Account(customer.getId(), customer.getDisplayName(), customer.getEmail());
    }

    /** How many spaces the person owns, and who would take them over: shown before deleting. */
    @GetMapping("/{id}/removal")
    @Transactional(readOnly = true)
    public Removal removal(@PathVariable Long id) {
        var customer = customer(id);
        var heir = memberships.findColleagues(id).stream().filter(user -> !user.isPlatformAdmin()).findFirst().orElse(null);
        return new Removal(tours.findByUser_IdOrderByIdDesc(id).size(), heir == null ? null : heir.getDisplayName(),
                heir == null ? null : heir.getEmail());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@PathVariable Long id) {
        var customer = customer(id);
        var spaces = tours.findByUser_IdOrderByIdDesc(id);
        if (!spaces.isEmpty()) {
            var heir = memberships.findColleagues(id).stream().filter(user -> !user.isPlatformAdmin()).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                            "This person has " + spaces.size() + (spaces.size() == 1 ? " space" : " spaces")
                                    + " and nobody else in their organization to take " + (spaces.size() == 1 ? "it" : "them")
                                    + " over. Add another person to the organization first."));
            spaces.forEach(space -> space.setUser(heir));
            tours.flush();
        }
        memberships.deleteAll(memberships.findByUser_Id(id));
        memberships.flush();
        users.delete(customer);
    }

    private User customer(Long id) {
        var user = users.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Person not found."));
        if (user.isPlatformAdmin())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admins are managed on the Team list.");
        return user;
    }

    public record Changes(
            @NotBlank @Size(max = 200) String displayName,
            @NotBlank @Email @Size(max = 254) String email,
            // Empty or missing: the password stays as it is.
            String password) {
    }

    public record Account(Long id, String displayName, String email) {}

    public record Removal(int spaces, String heirName, String heirEmail) {}
}
