import { useEffect, useState } from 'react'
import { getOrganizations } from '../../../organizations/api/organizations'
import { getProjects } from '../../../projects/api/projects'

/**
 * Where the customer's organization lives in Customers. A capture only knows the space (project) its tour was
 * delivered to, so the organization is found by looking through each one's spaces. Until it is found, or when it
 * cannot be, the link goes to the Customers list.
 */
export function useOrganizationLink(projectId: number | null | undefined): string {
 const [found, setFound] = useState<{ projectId: number; path: string } | null>(null)
 useEffect(() => {
  if (projectId == null) return
  let active = true
  async function find(target: number) {
   try {
    for (const organization of await getOrganizations()) {
     if (!active) return
     const projects = await getProjects(organization.id)
     if (projects.some(project => project.id === target)) {
      if (active) setFound({ projectId: target, path: '/organizations/' + organization.id })
      return
     }
    }
   } catch { /* The Customers list is a good enough destination. */ }
  }
  void find(projectId)
  return () => { active = false }
 }, [projectId])
 return found && found.projectId === projectId ? found.path : '/organizations'
}
