package com.example.platform.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

        // Not a bean on purpose: as a bean Spring Boot would also run it outside the security chain.
        private final LoginThrottle loginThrottle = new LoginThrottle();

        @Bean
        public SecurityFilterChain securityFilterChain(HttpSecurity http)
                        throws Exception {

                http.authorizeHttpRequests(auth -> auth
                                .dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ERROR).permitAll()
                                .requestMatchers("/api/auth/csrf").permitAll()
                                // Gallery links: the token itself is the permission, limited to one space (GalleryLinkController).
                                .requestMatchers("/api/gallery/**").permitAll()
                                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/public/views/**").permitAll()
                                .requestMatchers("/api/admin/**").hasRole("PLATFORM_ADMIN")
                                .requestMatchers(
                                                "/api/organizations",
                                                "/api/organizations/**")
                                .hasRole("PLATFORM_ADMIN")
                                .requestMatchers(org.springframework.http.HttpMethod.PUT,
                                                "/api/scans/*/viewer/starting-view", "/api/scans/*/preview")
                                .hasRole("PLATFORM_ADMIN")
                                .requestMatchers(org.springframework.http.HttpMethod.DELETE, "/api/scans/*")
                                .hasRole("PLATFORM_ADMIN")
                                .requestMatchers("/api/**").authenticated()
                                .requestMatchers(org.springframework.http.HttpMethod.GET, "/**").permitAll()
                                .anyRequest().authenticated())
                                .formLogin(form -> form
                                                .loginProcessingUrl("/api/auth/login")
                                                .usernameParameter("email")
                                                .successHandler((request, response, authentication) -> {
                                                        loginThrottle.succeeded(request);
                                                        response.setStatus(204);
                                                })
                                                .failureHandler((request, response, exception) -> {
                                                        loginThrottle.failed(request);
                                                        response.setStatus(401);
                                                })
                                                .permitAll())
                                .exceptionHandling(errors -> errors
                                                .authenticationEntryPoint((request, response, exception) -> response
                                                                .setStatus(401)))
                                .logout(logout -> logout
                                                .logoutUrl("/api/auth/logout")
                                                .deleteCookies("JSESSIONID")
                                                .logoutSuccessHandler((request, response, authentication) -> response
                                                                .setStatus(204)))
                                .headers(headers -> headers
                                                .frameOptions(frame -> frame.disable())
                                                .addHeaderWriter((request, response) -> {
                                                        // Internal SPA forwards must retain the original page's framing policy.
                                                        var forwarded = request.getAttribute(
                                                                        jakarta.servlet.RequestDispatcher.FORWARD_REQUEST_URI);
                                                        var path = forwarded instanceof String original
                                                                        ? original : request.getRequestURI();
                                                        if (!path.startsWith(request.getContextPath() + "/view/")) {
                                                                response.setHeader("X-Frame-Options", "DENY");
                                                                response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
                                                        }
                                                }))
                                .requestCache(cache -> cache.disable())
                                .httpBasic(basic -> basic.disable());

                http.addFilterBefore(loginThrottle,
                                org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter.class);
                return http.build();
        }
}