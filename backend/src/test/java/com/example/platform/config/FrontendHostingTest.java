package com.example.platform.config;

import jakarta.servlet.DispatcherType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class FrontendHostingTest {
    private AnnotationConfigWebApplicationContext context;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(TestConfig.class, SecurityConfig.class, FrontendController.class);
        context.refresh();
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(context.getBean(FilterChainProxy.class)).build();
    }

    @AfterEach
    void close() {
        context.close();
    }

    @Test
    void anonymousPagesForwardToReactButApiRemainsProtected() throws Exception {
        for (var path : new String[]{"/", "/login", "/dashboard", "/projects/1",
                "/organizations/1/projects/1"}) {
            mvc.perform(get(path)).andExpect(status().isOk())
                    .andExpect(forwardedUrl("/index.html"))
                    .andExpect(header().string("X-Frame-Options", "DENY"));
        }
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/scans/1/viewer")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/not-a-real-endpoint")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/scans/1/share")).andExpect(status().isForbidden());
    }

    @Test
    void onlyPublicViewerPagesAllowEmbeddingIncludingInternalForward() throws Exception {
        mvc.perform(get("/view/example-token")).andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"))
                .andExpect(header().doesNotExist("X-Frame-Options"))
                .andExpect(header().doesNotExist("Content-Security-Policy"));
        mvc.perform(get("/index.html").with(request -> { request.setDispatcherType(DispatcherType.FORWARD); return request; })
                .requestAttr(jakarta.servlet.RequestDispatcher.FORWARD_REQUEST_URI, "/view/example-token"))
                .andExpect(header().doesNotExist("X-Frame-Options"));
        mvc.perform(get("/index.html").with(request -> { request.setDispatcherType(DispatcherType.FORWARD); return request; })
                .requestAttr(jakarta.servlet.RequestDispatcher.FORWARD_REQUEST_URI, "/dashboard"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Content-Security-Policy", "frame-ancestors 'none'"));
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    static class TestConfig {
        @Bean
        UserDetailsService users() {
            return new InMemoryUserDetailsManager(User.withUsername("test")
                    .password("{noop}unused").roles("MEMBER").build());
        }
    }
}
