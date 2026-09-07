import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { AuthContext } from './auth-context'
import { AuthSession } from './auth-session'

export function AuthProvider({ children, session: suppliedSession }: { children: ReactNode; session?: AuthSession }) {
    const [session] = useState(() => suppliedSession ?? new AuthSession())
    useEffect(() => session.connect(flushSync), [session])
    return (
        <QueryClientProvider client={session.queryClient}>
            <AuthContext value={session}>{children}</AuthContext>
        </QueryClientProvider>
    )
}
