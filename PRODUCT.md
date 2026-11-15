# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Customers** are people who have a physical space (a home, a property for sale or rent, a venue, a shop) and want a 3D tour of it. The segment is deliberately mixed and not yet narrowed. They are not photographers. They capture the space themselves with a phone while standing in it, and today they do not know where to stand or how to shoot. That onboarding gap is the product's main problem.
- **The operator** (the platform owner and team) plans each capture, reviews the photos, builds the 3D tour and delivers it. Today this is one platform administrator.
- **Viewers** are whoever the customer shares the finished tour with. They open a link or an embed with no account.

## Product Purpose

A service that turns a customer's chosen place into a 3D tour they can walk through and share. The customer requests a tour, is guided through photographing the space, and receives the finished tour a few days later. Success is a customer who gets from "I want a tour of this place" to "here is the link" without being taught in person.

## Positioning

It is a guided service, not a tool. The customer never needs to learn 3D capture: the platform tells them exactly where to stand and which way to face for every photo, checks the result, and a person builds the tour for them. The long-term direction is for AI to take over the capture planning and photo review that the operator does by hand today.

## Operating Context

- Capture happens on a phone, inside the space, moving from point to point. Planning, reviewing, viewing and sharing also happen at a desk.
- The capture workflow: customer adds areas and a floor plan (uploaded or sketched) → operator places numbered capture points with directions on the plan → customer takes one photo per point → operator approves or asks for retakes → operator builds and delivers the tour.
- The finished tour is a Gaussian splat scene shown in an in-browser viewer with fly, walk and measure tools.
- Sharing today: a public link, an iframe embed, and a downloadable self-hosted viewer bundle.

## Capabilities and Constraints

- Stack: React 19, react-router, Vite, TypeScript, plain CSS; Spring Boot and PostgreSQL backend; Cloudflare R2 storage; PlayCanvas / SuperSplat viewer.
- The operator builds each tour by hand and delivers it in days. No automatic photo-to-3D generation exists. Copy must not promise instant or automatic results.
- Accounts are created by the operator; there is no self sign-up.
- Terminology: **Space** (a customer's place; a "project" in the data model), **Tour** (the finished 3D result; a "scan" in the data model), **Capture** (the guided photo process; a "tour request" in the data model).
- In the data model a capture request is not yet linked to a project or scan.
- Not yet built, and not to be presented as available: object generation, inventory, planner, AI capture planning, AI photo checks, password or expiring share links, QR codes, custom branding.

## Brand Commitments

None. "3D Platform" is a placeholder working name and is kept until the owner chooses one. No logo, colour or typeface is binding.

## Evidence on Hand

- A working capture workflow, viewer and share flow in this repository.
- No customer testimonials, pricing, usage numbers or example tours are on hand; none may be invented.

## Product Principles

1. Guidance over features: every screen should answer "what do I do next?" for someone who has never done this.
2. One place, one path: everything about a customer's space lives in that Space, in the order it happens.
3. It is a service: always show who has the next move — the customer or the team — and what happens after.
4. Honest about waiting: a person builds the tour, so say so and say what the customer can expect.
5. The result is theirs to share however they like.
