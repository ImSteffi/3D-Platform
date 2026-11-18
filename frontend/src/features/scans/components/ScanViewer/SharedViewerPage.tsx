import { useEffect } from 'react'
import { useParams } from 'react-router'
import { WorkspaceContext } from '../../../../shared/layout/WorkspaceLayout/WorkspaceContext'
import SplatScene from './SplatScene'
import './SplatScene.css'

const guest = { displayName: '', email: '', platformAdmin: false, owner: false, organizationNames: [] }

/** What a customer's viewer sees with no account: the tour, full-bleed, and nothing else. */
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
 if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return <main className="shared-tour on-dark">
  <div className="lens-stage-message lens-stage-message--solid" role="alert"><p>This tour isn't available. The link may have been turned off.</p></div>
 </main>
 return <WorkspaceContext.Provider value={guest}>
  <main className="shared-tour on-dark" aria-label="Tour"><SplatScene shareToken={token} /></main>
 </WorkspaceContext.Provider>
}
