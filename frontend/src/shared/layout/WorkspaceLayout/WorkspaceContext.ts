import { createContext, useContext } from 'react'
import type { CurrentUser } from '../../../features/auth/api/auth'
export const WorkspaceContext = createContext<CurrentUser | null>(null)
export function useWorkspaceUser() {
 const user = useContext(WorkspaceContext)
 if (!user) throw new Error('Workspace user is unavailable.')
 return user
}
