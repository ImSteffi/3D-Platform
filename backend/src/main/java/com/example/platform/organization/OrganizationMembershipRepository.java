package com.example.platform.organization;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OrganizationMembershipRepository
                extends JpaRepository<OrganizationMembership, Long> {

        List<OrganizationMembership> findByOrganization_IdOrderByIdAsc(
                        Long organizationId);

        @Query("""
                        SELECT membership.organization.name
                        FROM OrganizationMembership membership
                        WHERE membership.user.id = :userId
                        ORDER BY membership.organization.id
                        """)
        List<String> findOrganizationNamesByUserId(
                        @Param("userId") Long userId);
}