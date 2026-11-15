import { useCallback, useEffect, useState } from 'react'
import { getProjects } from '../../../projects/api/projects'
import { getScans, type SavedScan } from '../../../scans/api/scans'

export type CustomerTour = SavedScan & { organizationId: number; projectName: string }

/** Every tour in the customer's organisations, each with the project it was uploaded to. */
export function useCustomerTours(organizations: { id: number; name: string }[] | null) {
 const [tours, setTours] = useState<CustomerTour[] | null>(null)
 const [error, setError] = useState('')
 const [attempt, setAttempt] = useState(0)

 useEffect(() => {
  if (!organizations) return
  let active = true
  Promise.all(organizations.map(async organization => {
   const projects = await getProjects(organization.id)
   return Promise.all(projects.map(async project => (await getScans(organization.id, project.id))
    .map(scan => ({ ...scan, organizationId: organization.id, projectName: project.name }))))
  })).then(found => { if (active) setTours(found.flat(2)) })
   .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load the tours. Try again.') })
  return () => { active = false }
 }, [organizations, attempt])

 const retry = useCallback(() => { setError(''); setTours(null); setAttempt(value => value + 1) }, [])
 const remove = useCallback((scanId: number) => setTours(current => current?.filter(scan => scan.id !== scanId) ?? null), [])
 return { tours, error, retry, remove }
}
