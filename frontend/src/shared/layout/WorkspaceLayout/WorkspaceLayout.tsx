import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { getCurrentUser, logout, type CurrentUser } from '../../../features/auth/api/auth'
import { WorkspaceContext } from './WorkspaceContext'
import Icon from '../../ui/Icon/Icon'
import './WorkspaceLayout.css'

export default function WorkspaceLayout() {
 const [user, setUser] = useState<CurrentUser | null>(null)
 const [error, setError] = useState('')
 const [logoutError, setLogoutError] = useState('')
 const [loggingOut, setLoggingOut] = useState(false)
 const [menuOpen, setMenuOpen] = useState(false)
 const menuToggle = useRef<HTMLButtonElement>(null)
 const menuClose = useRef<HTMLButtonElement>(null)
 const navigate = useNavigate()
 const { pathname, search } = useLocation()
 useEffect(() => {
  let active = true
  getCurrentUser().then(current => {
   if (!active) return
   if (!current) navigate('/login', { replace: true })
   else setUser(current)
  }).catch(() => { if (active) setError('Could not connect to your workspace. Please refresh to try again.') })
  return () => { active = false }
 }, [navigate])
 useEffect(() => {
  if (!menuOpen) return
  menuClose.current?.focus()
  const close = (event: KeyboardEvent) => {
   if (event.key === 'Escape') { setMenuOpen(false); menuToggle.current?.focus() }
  }
  window.addEventListener('keydown', close)
  return () => window.removeEventListener('keydown', close)
 }, [menuOpen])
 async function signOut() {
  if (loggingOut) return
  setLoggingOut(true); setLogoutError('')
  try { await logout(); navigate('/login', { replace: true }) }
  catch { setLogoutError('Could not sign out. Please try again.') }
  finally { setLoggingOut(false) }
 }
 function searchWorkspace(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const query = String(new FormData(event.currentTarget).get('q') ?? '').trim()
  navigate(`${user?.platformAdmin ? '/organizations' : '/projects'}${query ? `?q=${encodeURIComponent(query)}` : ''}`)
 }
 if (error) return <main className="dashboard"><p className="page-message" role="alert">{error}</p></main>
 if (!user) return <div className="workspace-loading" role="status"><Icon name="cube" size={32} /><p>Opening your workspace…</p></div>
 const initials = user.displayName.split(' ').filter(Boolean).slice(0,2).map(s => s[0]).join('').toUpperCase()
 return <WorkspaceContext.Provider value={user}>
  <div className={`workspace ${menuOpen ? 'workspace--menu-open' : ''}`}>
   <a className="skip-link" href="#workspace-main">Skip to content</a>
   {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
   <aside className="sidebar" aria-label="Main navigation">
    <button ref={menuClose} className="sidebar-close" aria-label="Close menu" onClick={() => { setMenuOpen(false); menuToggle.current?.focus() }}><Icon name="close" size={16} /></button>
    <Link className="workspace-brand" to="/dashboard" onClick={() => setMenuOpen(false)}><span className="brand-symbol"><Icon name="cube" size={25} /></span><span>3D Platform</span></Link>
    <span className="nav-label">WORKSPACE</span>
    <nav className="sidebar-nav">
     <NavLink to="/dashboard" onClick={() => setMenuOpen(false)}><Icon name="grid" />Overview</NavLink>
     {user.platformAdmin
      ? <NavLink to="/organizations" onClick={() => setMenuOpen(false)}><Icon name="building" />Organizations</NavLink>
      : <NavLink to="/projects" onClick={() => setMenuOpen(false)}><Icon name="folder" />Projects</NavLink>}
    </nav>
    <div className="sidebar-bottom">
     <button className="sidebar-logout" onClick={() => { void signOut() }} disabled={loggingOut}><Icon name="logout" />{loggingOut ? 'Signing out…' : 'Sign out'}</button>
     {logoutError && <p className="field-error" role="alert">{logoutError}</p>}
    </div>
   </aside>
   <div className="workspace-body">
    <header className="workspace-topbar">
     <button ref={menuToggle} className="mobile-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" /></button>
     <form className="workspace-search" onSubmit={searchWorkspace}><Icon name="search" size={16} /><input key={pathname + search} aria-label={user.platformAdmin ? 'Search organizations' : 'Search projects'} name="q" defaultValue={new URLSearchParams(search).get('q') ?? ''} placeholder={user.platformAdmin ? 'Search organizations…' : 'Search your projects…'} /><kbd>↵</kbd></form>
     <div className="topbar-profile"><span className="workspace-avatar">{initials}</span><span><strong>{user.displayName}</strong><small>{user.platformAdmin ? 'Platform administrator' : 'Member'}</small></span></div>
    </header>
    <div id="workspace-main" className="route-content" key={pathname}><Outlet /></div>
   </div>
  </div>
 </WorkspaceContext.Provider>
}
