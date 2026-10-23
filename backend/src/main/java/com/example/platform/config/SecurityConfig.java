package com.example.platform.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

        @Bean
        public SecurityFilterChain securityFilterChain(HttpSecurity http)
                        throws Exception {

                http.authorizeHttpRequests(auth -> auth
                                .requestMatchers("/api/auth/csrf").permitAll()
                                .requestMatchers(
                                                "/api/organizations",
                                                "/api/organizations/**")
                                .hasRole("PLATFORM_ADMIN")
                                .requestMatchers(org.springframework.http.HttpMethod.PUT,
                                                "/api/scans/*/viewer/starting-view")
                                .hasRole("PLATFORM_ADMIN")
                                .anyRequest().authenticated())
                                .formLogin(form -> form
                                                .loginProcessingUrl("/api/auth/login")
                                                .usernameParameter("email")
                                                .successHandler((request, response, authentication) -> response
                                                                .setStatus(204))
                                                .failureHandler((request, response, exception) -> response
                                                                .setStatus(401))
                                                .permitAll())
                                .exceptionHandling(errors -> errors
                                                .authenticationEntryPoint((request, response, exception) -> response
                                                                .setStatus(401)))
                                .logout(logout -> logout
                                                .logoutUrl("/api/auth/logout")
                                                .deleteCookies("JSESSIONID")
                                                .logoutSuccessHandler((request, response, authentication) -> response
                                                                .setStatus(204)))
                                .requestCache(cache -> cache.disable())
                                .httpBasic(basic -> basic.disable());

                return http.build();
        }
}