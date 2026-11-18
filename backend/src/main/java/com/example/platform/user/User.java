package com.example.platform.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users", schema = "public")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "display_name", nullable = false, length = 200)
    private String displayName;

    @Column(name = "email", nullable = false, length = 254)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "is_platform_admin", nullable = false)
    private boolean platformAdmin;

    // The one admin who adds and removes the other admins. Never removable.
    @Column(name = "is_owner", nullable = false)
    private boolean owner;

    protected User() {
    }

    public User(String displayName, String email, String passwordHash) {
        this.displayName = displayName;
        this.email = email;
        this.passwordHash = passwordHash;
        this.platformAdmin = false;
    }

    public Long getId() {
        return id;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public boolean isPlatformAdmin() {
        return platformAdmin;
    }

    public boolean isOwner() {
        return owner;
    }

    /** A team member: can do all the work, but is not the owner. */
    public static User admin(String displayName, String email, String passwordHash) {
        var user = new User(displayName, email, passwordHash);
        user.platformAdmin = true;
        return user;
    }
}