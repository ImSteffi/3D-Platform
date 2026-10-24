import { useEffect } from 'react'
import { useParams } from 'react-router'
import { WorkspaceContext } from '../../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import SplatScene from './SplatScene'

const guest = { displayName: '', email: '', platformAdmin: false, organizationNames: [] }

export default function SharedViewerPage() {
 const { token } = useParams()
 useEffect(() => {
  const robots = document.createElement('meta')
  robots.name = 'robots'
  robots.content = 'noindex, nofollow, noarchive'
  const referrer = document.createElement('meta')
  referrer.name = 'referrer'
  referrer.content = 'no-referrer'
  document.head.append(robots, referrer)
  return () => { robots.remove(); referrer.remove() }
 }, [])
 if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return <p role="alert">This 3D tour is currently unavailable.</p>
 return <WorkspaceContext.Provider value={guest}>
  <main style={{ position: 'fixed', inset: 0 }} aria-label="3D viewer"><SplatScene shareToken={token} /></main>
 </WorkspaceContext.Provider>
}