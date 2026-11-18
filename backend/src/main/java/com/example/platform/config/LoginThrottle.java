package com.example.platform.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Stops password guessing. After too many failed sign-ins for one email, or from one address, further
 * attempts are refused for a while, even with the right password. Kept in memory: one backend instance.
 */

public class LoginThrottle extends OncePerRequestFilter {

    static final String LOGIN_PATH = "/api/auth/login";
    static final int MAX_PER_EMAIL = 5;
    static final int MAX_PER_ADDRESS = 20;
    static final Duration WINDOW = Duration.ofMinutes(15);

    private record Tries(int count, Instant since) {}

    private final ConcurrentHashMap<String, Tries> failures = new ConcurrentHashMap<>();

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !("POST".equals(request.getMethod()) && LOGIN_PATH.equals(request.getRequestURI()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (blocked(emailKey(request), MAX_PER_EMAIL) || blocked(addressKey(request), MAX_PER_ADDRESS)) {
            response.setStatus(429);
            response.setHeader("Retry-After", String.valueOf(WINDOW.toSeconds()));
            return;
        }
        chain.doFilter(request, response);
    }

    /** Called by the login failure handler. */
    public void failed(HttpServletRequest request) {
        count(emailKey(request));
        count(addressKey(request));
    }

    /** Called by the login success handler: the email starts clean. */
    public void succeeded(HttpServletRequest request) {
        failures.remove(emailKey(request));
    }

    private boolean blocked(String key, int max) {
        var tries = failures.get(key);
        if (tries == null) return false;
        if (tries.since().plus(WINDOW).isBefore(Instant.now())) {
            failures.remove(key, tries);
            return false;
        }
        return tries.count() >= max;
    }

    private void count(String key) {
        var now = Instant.now();
        failures.compute(key, (k, tries) -> tries == null || tries.since().plus(WINDOW).isBefore(now)
                ? new Tries(1, now) : new Tries(tries.count() + 1, tries.since()));
        // Keeps the map small if someone sprays many emails.
        if (failures.size() > 50_000) failures.entrySet().removeIf(e -> e.getValue().since().plus(WINDOW).isBefore(now));
    }

    private static String emailKey(HttpServletRequest request) {
        var email = request.getParameter("email");
        return "email:" + (email == null ? "" : email.strip().toLowerCase(Locale.ROOT));
    }

    // Behind the production proxy, server.forward-headers-strategy makes this the real client address.
    private static String addressKey(HttpServletRequest request) {
        return "ip:" + request.getRemoteAddr();
    }
}
