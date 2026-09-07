import { useQuery } from '@tanstack/react-query'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ApiError } from '../../api/api-error'
import { useAuth } from '../auth/use-auth'
import {
    changeTeamRole,
    disableTeamMember,
    issueInvitation,
    readTeam,
    teamQueryKey,
    type InviteRequest,
    type TeamRole,
} from './team-api'
import { teamCopy } from './team-copy'

function failureCopy(error: unknown, invitation: boolean): string {
    if (error instanceof ApiError) {
        if (error.status === 403) return teamCopy.rejected
        if (error.status === 404) return teamCopy.missing
        if (error.status === 409) return teamCopy.conflict
        if (error.status === 400) return teamCopy.invalid
    }
    return invitation ? teamCopy.inviteUncertain : teamCopy.requestError
}

interface OperationState {
    pending: 'invitation' | 'member' | 'copy' | null
    issuedUrl: string | null
    notice: string
}

const emptyState: OperationState = { pending: null, issuedUrl: null, notice: '' }

export function useTeam(organizationId: string) {
    const { api } = useAuth()
    const members = useQuery({
        queryKey: teamQueryKey(organizationId),
        queryFn: ({ signal }) => readTeam(api, organizationId, signal),
    })
    const [operation, setOperation] = useState<OperationState>(emptyState)
    const lifetime = useRef({ generation: 0, controller: new AbortController(), busy: false })
    const issuedUrl = useRef<string | null>(null)

    const clear = useCallback((notice = '', render = true) => {
        lifetime.current.generation += 1
        lifetime.current.controller.abort()
        lifetime.current.controller = new AbortController()
        lifetime.current.busy = false
        issuedUrl.current = null
        window.getSelection()?.removeAllRanges()
        if (render) setOperation({ ...emptyState, notice })
    }, [])

    useLayoutEffect(() => {
        const forget = () => flushSync(() => clear(teamCopy.dismissed))
        const restore = (event: PageTransitionEvent) => {
            if (event.persisted) forget()
        }
        window.addEventListener('pagehide', forget)
        window.addEventListener('pageshow', restore)
        return () => {
            window.removeEventListener('pagehide', forget)
            window.removeEventListener('pageshow', restore)
            clear('', false)
        }
    }, [clear])

    async function run(
        kind: 'invitation' | 'member',
        request: (signal: AbortSignal) => Promise<string | void>,
        success: string,
    ) {
        if (lifetime.current.busy || !navigator.onLine) return
        clear()
        const { generation, controller } = lifetime.current
        const current = () => generation === lifetime.current.generation && !controller.signal.aborted
        lifetime.current.busy = true
        setOperation({ ...emptyState, pending: kind })
        try {
            const result = await request(controller.signal)
            if (!current()) return
            // One-time results stay in this mounted feature only, never in the shared MutationCache.
            issuedUrl.current = typeof result === 'string' ? result : null
            setOperation({ pending: null, issuedUrl: typeof result === 'string' ? result : null, notice: success })
        } catch (error) {
            if (!current()) return
            setOperation({ ...emptyState, notice: failureCopy(error, kind === 'invitation') })
        } finally {
            if (current()) {
                lifetime.current.busy = false
                // Every settlement reloads server state, including hierarchy and final-owner rejections.
                void members.refetch()
            }
        }
    }

    async function copy() {
        if (!issuedUrl.current || lifetime.current.busy) return
        const { generation } = lifetime.current
        lifetime.current.busy = true
        setOperation(value => ({ ...value, pending: 'copy' }))
        try {
            await navigator.clipboard.writeText(issuedUrl.current)
            if (generation === lifetime.current.generation) clear(teamCopy.copied)
        } catch {
            if (generation === lifetime.current.generation) {
                lifetime.current.busy = false
                setOperation(value => ({ ...value, pending: null, notice: teamCopy.copyFailed }))
            }
        }
    }

    return {
        members,
        operation,
        dismiss: () => clear(teamCopy.dismissed),
        copied: () => clear(teamCopy.copied),
        copy,
        invite: (body: InviteRequest) =>
            run('invitation', signal => issueInvitation(api, organizationId, body, signal), ''),
        changeRole: (id: string, role: TeamRole) =>
            run('member', signal => changeTeamRole(api, organizationId, id, role, signal), teamCopy.roleSaved),
        remove: (id: string) =>
            run('member', signal => disableTeamMember(api, organizationId, id, signal), teamCopy.removed),
    }
}
