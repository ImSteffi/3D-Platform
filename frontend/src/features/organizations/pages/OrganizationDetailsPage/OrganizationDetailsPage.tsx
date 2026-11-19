import BackLink from '../../../../shared/ui/BackLink/BackLink'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { Button, EmptyState, Field, InlineError, Panel, Skeleton, SkeletonGroup } from '../../../../shared/ui'
import DeskRowsSkeleton from '../../components/DeskRowsSkeleton'
import { useShellMode } from '../../../../shared/layout/Backdrop'
import { getOrganizations, type Organization } from '../../api/organizations'
import { renameOrganization } from '../../api/team'
import { getOrganizationUsers, type OrganizationUser } from '../../api/organizationUsers'
import OrganizationSpaces from './OrganizationSpaces'
import OrganizationTours from '../../../projects/components/OrganizationTours/OrganizationTours'
import '../../styles/customers.css'
import './OrganizationDetailsPage.css'

export default function OrganizationDetailsPage() {
 useShellMode('desk')
 const { organizationId } = useParams()
 const id = Number(organizationId)

 const [organization, setOrganization] = useState<Organization | null>(null)
 const [loading, setLoading] = useState(true)
 const [loadError, setLoadError] = useState('')
 const [attempt, setAttempt] = useState(0)

 const [users, setUsers] = useState<OrganizationUser[]>([])
 const [renaming, setRenaming] = useState(false)
 const [newName, setNewName] = useState('')
 const [renameError, setRenameError] = useState('')
 const [savingName, setSavingName] = useState(false)

 async function saveName(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const trimmed = newName.trim()
  if (!trimmed || trimmed.length > 200) { setRenameError('Enter a name of 1 to 200 characters.'); return }
  setSavingName(true); setRenameError('')
  try { setOrganization(await renameOrganization(id, trimmed)); setRenaming(false) }
  catch (reason) { setRenameError(reason instanceof Error ? reason.message : 'Could not rename this organization.') }
  finally { setSavingName(false) }
 }

 useEffect(() => {
  let active = true

  // The API has no single-customer endpoint, so the customer is found in the full list.
  async function loadOrganization() {
   try {
    const organizations = await getOrganizations()
    const found = organizations.find(item => item.id === id)
    const members = found ? await getOrganizationUsers(id) : []
    if (active) {
     setOrganization(found ?? null)
     setUsers(members)
    }
   } catch (error) {
    if (active) setLoadError(error instanceof Error ? error.message : 'Could not load this customer. Try again.')
   } finally {
    if (active) setLoading(false)
   }
  }

  void loadOrganization()
  return () => { active = false }
 }, [id, attempt])

 const retry = useCallback(() => { setLoading(true); setLoadError(''); setAttempt(value => value + 1) }, [])

 const organizationUsers = users.filter(user => user.organizationId === id)

 return <main className="page customer-page">
  <header className="page-header">
   <div>
    <BackLink to="/users" />
    {renaming
     ? <form className="org-rename" onSubmit={saveName} noValidate>
      <Field name="organizationName" label="Organization name" value={newName} onChange={setNewName} error={renameError} autoComplete="off" autoFocus maxLength={200} />
      <div className="desk-form-actions">
       <Button type="submit" loading={savingName}>Save</Button>
       <Button variant="secondary" onClick={() => setRenaming(false)}>Cancel</Button>
      </div>
     </form>
     : <h1 className="desk-title">{organization?.name ?? 'Customer'}</h1>}
   </div>
   {organization && !renaming && <Button variant="secondary" icon="edit" onClick={() => { setNewName(organization.name); setRenameError(''); setRenaming(true) }}>Rename</Button>}
  </header>

  <Panel padding="lg" className="desk-window">
   {loading ? <SkeletonGroup label="Loading customer">
     <section className="desk-section">
      <div className="desk-section-head"><Skeleton width={96} height={22} index={0} /><Skeleton width={148} height={44} radius={999} index={1} /></div>
      <DeskRowsSkeleton mark="person" rows={3} start={2} />
     </section>
     <section className="desk-section">
      <div className="desk-section-head"><Skeleton width={88} height={22} index={6} /><Skeleton width={140} height={44} radius={999} index={7} /></div>
      <DeskRowsSkeleton mark="space" rows={2} start={8} />
     </section>
    </SkeletonGroup>
    : loadError ? <InlineError onRetry={retry}>{loadError}</InlineError>
    : !organization ? <EmptyState icon="building" title="Customer not found"
      text="This customer does not exist, or the link is out of date."
      action={<Button variant="secondary" to="/users" icon="back">Back to users</Button>} />
    : <>
     <OrganizationSpaces users={organizationUsers} />
     <OrganizationTours key={organization.id} organizationId={organization.id} />
    </>}
  </Panel>
 </main>
}
