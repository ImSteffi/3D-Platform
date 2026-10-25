package com.example.platform.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class FrontendController {

    @GetMapping({
            "/",
            "/login",
            "/dashboard",
            "/projects",
            "/projects/{projectId}",
            "/organizations",
            "/organizations/{organizationId}",
            "/organizations/{organizationId}/projects/{projectId}",
            "/view/{token}"
    })
    public String frontend() {
        return "forward:/index.html";
    }
}
