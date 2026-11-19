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
                        SELECT membership.organization
                        FROM OrganizationMembership membership
                        WHERE membership.user.id = :userId
                        ORDER BY membership.organization.id
                        """)
        List<Organization> findOrganizationsByUserId(@Param("userId") Long userId);

        boolean existsByOrganization_IdAndUser_Id(Long organizationId, Long userId);

        List<OrganizationMembership> findByUser_Id(Long userId);

        /** Other people in any of the user's organizations, oldest membership first: who takes over their spaces. */
        @Query("""
                        select theirs.user from OrganizationMembership mine, OrganizationMembership theirs
                        where mine.user.id = :userId and theirs.organization.id = mine.organization.id
                        and theirs.user.id <> :userId
                        order by theirs.id
                        """)
        List<com.example.platform.user.User> findColleagues(@Param("userId") Long userId);

        @Query("""
                        SELECT membership.organization.name
                        FROM OrganizationMembership membership
                        WHERE membership.user.id = :userId
                        ORDER BY membership.organization.id
                        """)
        List<String> findOrganizationNamesByUserId(
                        @Param("userId") Long userId);

        /** True when both users belong to at least one same organization: they share its spaces. */
        @Query("""
                        select count(mine) > 0 from OrganizationMembership mine, OrganizationMembership theirs
                        where mine.user.id = :userId and theirs.user.id = :otherId
                        and mine.organization.id = theirs.organization.id
                        """)
        boolean shareAnOrganization(@Param("userId") Long userId, @Param("otherId") Long otherId);
}