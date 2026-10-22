package com.example.platform.organization;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrganizationMembershipRepository
        extends JpaRepository<OrganizationMembership, Long> {

    List<OrganizationMembership> findByOrganization_IdOrderByIdAsc(
            Long organizationId);
}