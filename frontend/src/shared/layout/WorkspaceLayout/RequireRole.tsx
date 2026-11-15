import { Navigate, Outlet } from 'react-router'
import { useWorkspaceUser } from './WorkspaceContext'

/** Route guard: a customer on an operator route goes to /home; an operator on a customer route goes to /review. */
export default function RequireRole({ role }: { role: 'customer' | 'operator' }) {
 const user = useWorkspaceUser()
 if (role === 'operator' && !user.platformAdmin) return <Navigate to="/home" replace />
 if (role === 'customer' && user.platformAdmin) return <Navigate to="/review" replace />
 return <Outlet />
}
