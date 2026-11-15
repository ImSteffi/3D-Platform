package com.example.platform.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class FrontendController {

    @GetMapping({
            "/",
            "/login",
            "/home",
            "/dashboard",
            "/spaces",
            "/spaces/new",
            "/spaces/{id}",
            "/spaces/{id}/{tab}",
            "/learn",
            "/review",
            "/review/{id}",
            "/projects",
            "/projects/{projectId}",
            "/organizations",
            "/organizations/{organizationId}",
            "/organizations/{organizationId}/projects/{projectId}",
            "/organizations/{organizationId}/people/{userId}",
            "/view/{token}",
            // Earlier addresses that the React router still answers.
            "/generate",
            "/generate/tour",
            "/generate/tour/{id}",
            "/tour-requests",
            "/tour-requests/{id}"
    })
    public String frontend() {
        return "forward:/index.html";
    }
}
