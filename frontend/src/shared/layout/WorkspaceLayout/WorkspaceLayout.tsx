import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { getCurrentUser, logout, type CurrentUser } from '../../../features/auth/api/auth'
import { getAdminTourRequests, getTourRequests, whoseMove, type TourSummary } from '../../../features/tours/api/tourRequests'
import { WorkspaceContext } from './WorkspaceContext'
import Backdrop from '../Backdrop/Backdrop'
import BackdropProvider from '../Backdrop/BackdropProvider'
import { useBackdropState, type ShellMode } from '../Backdrop/backdropContext'
import Icon, { type IconName } from '../../ui/Icon/Icon'
import Skeleton, { SkeletonGroup } from '../../ui/Skeleton/Skeleton'
import ScanViewer from '../../../features/scans/components/ScanViewer/ScanViewer'
import './WorkspaceLayout.css'

const moveOrder = { you: 0, team: 1, done: 2 }
const moveWords = { you: 'Your move', team: 'With the team', done: 'Tour ready' }
const waitingOnOperator = (tour: TourSummary) => tour.status === 'SUBMITTED' || tour.status === 'PHOTOS_SUBMITTED' || tour.status === 'APPROVED'
 || (tour.status === 'PLAN_READY' && (tour.areasToPlan ?? 0) > 0)
// The tabs of one Space share a key so switching tab does not remount the page.
const routeKeyOf = (pathname: string) => pathname.replace(/^(\/spaces\/[^/]+)\/.*$/, '$1')

export default function WorkspaceLayout() {
 return <BackdropProvider><Shell /></BackdropProvider>
}

function Shell() {
 const [user, setUser] = useState<CurrentUser | null>(null)
 const [error, setError] = useState('')
 const [logoutError, setLogoutError] = useState('')
 const [loggingOut, setLoggingOut] = useState(false)
 const [accountOpen, setAccountOpen] = useState(false)
 const [tours, setTours] = useState<TourSummary[] | null>(null)
 const accountToggle = useRef<HTMLButtonElement>(null)
 const accountSignOut = useRef<HTMLButtonElement>(null)
 const navigate = useNavigate()
 const { pathname } = useLocation()
 const backdrop = useBackdropState()
 const routeKey = routeKeyOf(pathname)
 const operator = !!user?.platformAdmin
 const signedIn = !!user

 useEffect(() => {
  let active = true
  getCurrentUser().then(current => {
   if (!active) return
   if (!current) navigate('/login', { replace: true })
   else setUser(current)
  }).catch(() => { if (active) setError('We could not reach the server. Check your connection and refresh the page.') })
  return () => { active = false }
 }, [navigate])

 // Sidebar data: the customer's spaces, or the operator's queue count. Refreshed on every navigation; a failure keeps the last list.
 useEffect(() => {
  if (!signedIn) return
  let active = true
  const request = operator ? getAdminTourRequests() : getTourRequests()
  request.then(loaded => { if (active) setTours(loaded) })
   .catch(() => {})
  return () => { active = false }
 }, [signedIn, operator, routeKey])

 useEffect(() => {
  if (!accountOpen) return
  accountSignOut.current?.focus()
  const close = (event: KeyboardEvent) => {
   if (event.key === 'Escape') { setAccountOpen(false); accountToggle.current?.focus() }
  }
  window.addEventListener('keydown', close)
  return () => window.removeEventListener('keydown', close)
 }, [accountOpen])

 async function signOut() {
  if (loggingOut) return
  setLoggingOut(true); setLogoutError('')
  try { await logout(); navigate('/login', { replace: true }) }
  catch { setLogoutError('Could not sign out. Check your connection and try again.') }
  finally { setLoggingOut(false) }
 }

 if (error) return <div className="workspace-gate"><Backdrop /><p className="workspace-gate-panel" role="alert">{error}</p></div>
 if (!user) return <div className="workspace-gate"><Backdrop /><p className="workspace-gate-panel workspace-gate-panel--loading" role="status"><Icon name="cube" size={22} />Opening your account…</p></div>

 const mode: ShellMode = backdrop.mode ?? (operator ? 'desk' : 'place')
 const home = operator ? '/review' : '/home'
 const roleLine = operator ? 'Team' : 'Customer'
 const initials = user.displayName.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
 const queueCount = operator && tours ? tours.filter(waitingOnOperator).length : 0
 const spaces = !operator && tours
  ? [...tours].sort((a, b) => moveOrder[whoseMove(a.status)] - moveOrder[whoseMove(b.status)]).slice(0, 5)
  : []
 const items: { to: string; icon: IconName; label: string; badge?: number }[] = operator
  ? [{ to: '/review', icon: 'queue', label: 'Queue', badge: queueCount }, { to: '/organizations', icon: 'users', label: 'Customers' }]
  : [{ to: '/home', icon: 'home', label: 'Home' }, { to: '/spaces', icon: 'spaces', label: 'Spaces' }, { to: '/learn', icon: 'learn', label: 'Learn' }]
 const signOutLabel = loggingOut ? 'Signing out…' : 'Sign out'

 return <WorkspaceContext.Provider value={user}>
  <div className={`workspace workspace--${mode}`}>
   <Backdrop mode={mode} url={backdrop.url} />
   <a className="skip-link" href="#workspace-main">Skip to content</a>
   {mode !== 'lens' && <header className="workspace-topbar">
    <Link className="workspace-brand" to={home}><span className="brand-symbol"><Icon name="cube" size={18} /></span><span>3D Platform</span></Link>
    <button ref={accountToggle} type="button" className="workspace-avatar workspace-avatar--button" aria-label={`Account: ${user.displayName}`}
     aria-haspopup="true" aria-expanded={accountOpen} aria-controls="workspace-account-menu" onClick={() => setAccountOpen(!accountOpen)}>{initials}</button>
    {accountOpen && <>
     <button type="button" className="account-scrim" aria-label="Close account menu" tabIndex={-1} onClick={() => setAccountOpen(false)} />
     <div id="workspace-account-menu" className="account-menu" role="group" aria-label="Account">
      <p className="account-text"><strong>{user.displayName}</strong><small>{roleLine}</small></p>
      <button ref={accountSignOut} type="button" className="account-signout" onClick={() => { void signOut() }} disabled={loggingOut}><Icon name="logout" size={17} />{signOutLabel}</button>
      {logoutError && <p className="account-error" role="alert">{logoutError}</p>}
     </div>
    </>}
   </header>}
   {mode !== 'lens' && <aside className="sidebar" aria-label="Main navigation">
    <Link className="workspace-brand" to={home}><span className="brand-symbol"><Icon name="cube" size={18} /></span><span>3D Platform</span></Link>
    <nav className="sidebar-nav">
     {items.map(item => <NavLink key={item.to} to={item.to}>
      <Icon name={item.icon} /><span>{item.label}</span>
      {!!item.badge && <b className="sidebar-badge" aria-label={`${item.badge} waiting for you`}>{item.badge}</b>}
     </NavLink>)}
    </nav>
    {!operator && <section className="sidebar-spaces" aria-labelledby="sidebar-spaces-title">
     <h2 id="sidebar-spaces-title">Your spaces</h2>
     <ul>
      {!tours && <li><SkeletonGroup label="Loading your spaces">
       {['68%', '52%'].map((width, row) => <div key={row} className="sidebar-space">
        <Skeleton width={34} height={34} radius={10} index={row * 2} />
        <span className="sidebar-space-text"><Skeleton width={width} height={13} index={row * 2 + 1} /><Skeleton width="44%" height={11} index={row * 2 + 1} style={{ marginTop: 5 }} /></span>
       </div>)}
      </SkeletonGroup></li>}
      {spaces.map(space => {
       const who = whoseMove(space.status)
       return <li key={space.id}><NavLink className="sidebar-space" to={`/spaces/${space.id}`}>
        <span className={`sidebar-space-mark sidebar-space-mark--${who}`}><Icon name={who === 'done' ? 'check' : 'pin'} size={17} /></span>
        <span className="sidebar-space-text"><span>{space.name}</span><small>{moveWords[who]}</small></span>
       </NavLink></li>
      })}
      <li><Link className="sidebar-space sidebar-space--new" to="/spaces/new">
       <span className="sidebar-space-mark sidebar-space-mark--new"><Icon name="plus" size={17} /></span>
       <span className="sidebar-space-text"><span>Start a space</span></span>
      </Link></li>
     </ul>
    </section>}
    <div className="sidebar-account">
     <div className="account-id"><span className="workspace-avatar" aria-hidden="true">{initials}</span><p className="account-text"><strong>{user.displayName}</strong><small>{roleLine}</small></p></div>
     <button type="button" className="account-signout" onClick={() => { void signOut() }} disabled={loggingOut}><Icon name="logout" size={17} />{signOutLabel}</button>
     {logoutError && <p className="account-error" role="alert">{logoutError}</p>}
    </div>
   </aside>}
   <div className="workspace-body">
    <div id="workspace-main" className="route-content" key={routeKey} tabIndex={-1}><ScanViewer><Outlet /></ScanViewer></div>
   </div>
  </div>
 </WorkspaceContext.Provider>
}
