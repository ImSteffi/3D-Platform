package com.example.platform.project;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository
        extends JpaRepository<Project, Long> {

    @org.springframework.data.jpa.repository.Query("""
            select p from Project p
            where exists (select m.id from OrganizationMembership m
                where m.organization.id = p.organization.id and m.user.id = :userId)
            order by p.id
            """)
    List<Project> findAccessibleProjects(
            @org.springframework.data.repository.query.Param("userId") Long userId);

    @org.springframework.data.jpa.repository.Query("""
            select p from Project p where p.id = :projectId
            and exists (select m.id from OrganizationMembership m
                where m.organization.id = p.organization.id and m.user.id = :userId)
            """)
    java.util.Optional<Project> findAccessibleProject(
            @org.springframework.data.repository.query.Param("userId") Long userId,
            @org.springframework.data.repository.query.Param("projectId") Long projectId);

    List<Project> findByOrganization_IdOrderByIdAsc(
            Long organizationId);
}