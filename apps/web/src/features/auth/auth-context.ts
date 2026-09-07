import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AuthSession } from './auth-session'

export const AuthContext = createContext<AuthSession | null>(null)

export function useAuth() {
    const session = useContext(AuthContext)
    if (session === null) throw new Error('Authentication must be used inside AuthProvider.')
    const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
    return {
        state,
        api: session.api,
        queryClient: session.queryClient,
        bootstrap: session.bootstrap,
        signOut: session.signOut,
        clearAccessDenied: session.clearAccessDenied,
        mutationOptions: session.mutationOptions,
    }
}
