import { createContext, useContext } from 'react'
import type { CurrentUser } from '../../../features/auth/api/auth'
export const WorkspaceContext = createContext<CurrentUser | null>(null)
/** The signed-in user ({ displayName, email, platformAdmin, organizationNames }). `platformAdmin` = operator. Only inside the workspace shell. */
export function useWorkspaceUser(): CurrentUser {
 const user = useContext(WorkspaceContext)
 if (!user) throw new Error('Workspace user is unavailable.')
 return user
}
