import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@tuposoft/lead-email-finder-api-client'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ApiError } from '../../api/api-error'
import { useAuth } from '../auth/use-auth'
import {
    createOrganization,
    organizationDirectoryQueryKey,
    organizationReconciliationQueryKey,
    readOrganizations,
    type CreateOrganization,
} from './platform-organizations-api'
import { organizationsCopy as copy } from './platform-organizations-copy'
import { readOrganizationRecoveryHint, rememberOrganizationRecoveryHint } from './organization-recovery-hint'

interface Operation {
    pending: 'create' | 'copy' | null
    issued: boolean
    notice: string
}
const emptyOperation: Operation = { pending: null, issued: false, notice: '' }
interface RecoveryMarker {
    membershipId: string
    required: boolean
    dismissed: boolean
}
// AuthSession clears QueryCache on BFCache transitions. Keep document recovery flags
// keyed to its client and principal; a principal-scoped boolean hint also survives reload.
// Neither location contains organization details, request bodies, or invitation data.
const recoveryMarkers = new WeakMap<ApiClient, RecoveryMarker>()

export function usePlatformOrganizations(membershipId: string) {
    const { api } = useAuth()
    const queryClient = useQueryClient()
    const marker = recoveryMarkers.get(api)
    const recovery = marker?.membershipId === membershipId ? marker : undefined
    const remember = useCallback(
        (change: Partial<Omit<RecoveryMarker, 'membershipId'>>) => {
            const previous = recoveryMarkers.get(api)
            recoveryMarkers.set(api, {
                required: false,
                dismissed: false,
                ...(previous?.membershipId === membershipId ? previous : {}),
                ...change,
                membershipId,
            })
            if (change.required !== undefined) rememberOrganizationRecoveryHint(membershipId, change.required)
        },
        [api, membershipId],
    )
    const directory = useInfiniteQuery({
        queryKey: organizationDirectoryQueryKey,
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) => readOrganizations(api, pageParam, signal),
        getNextPageParam: page => page.nextPageToken,
    })
    // Query state provides subscriptions; the document marker survives BFCache cache clearing.
    const reconciliation = useQuery({
        queryKey: organizationReconciliationQueryKey,
        queryFn: () => false,
        initialData: recovery?.required ?? readOrganizationRecoveryHint(membershipId),
        enabled: false,
        gcTime: Infinity,
    })
    const [operation, setOperation] = useState<Operation>(() => ({
        ...emptyOperation,
        notice: recovery?.dismissed ? copy.dismissed : '',
    }))
    const [formVersion, setFormVersion] = useState(0)
    const lifetime = useRef({ generation: 0, controller: new AbortController(), pending: null as Operation['pending'] })
    const invitation = useRef<string | null>(null)
    const submitted = useRef<CreateOrganization | null>(null)
    const readInvitation = useCallback(() => invitation.current ?? '', [])
    const refresh = useCallback(
        () => queryClient.resetQueries({ queryKey: organizationDirectoryQueryKey, exact: true }),
        [queryClient],
    )
    const clear = useCallback(() => {
        lifetime.current.generation += 1
        lifetime.current.controller.abort()
        lifetime.current.controller = new AbortController()
        lifetime.current.pending = null
        invitation.current = null
        if (submitted.current) {
            submitted.current.name = ''
            submitted.current.ownerEmail = ''
        }
        submitted.current = null
        window.getSelection()?.removeAllRanges()
    }, [])
    const dismiss = useCallback(
        (render = true) => {
            const pending = lifetime.current.pending === 'create'
            const issued = invitation.current !== null
            if (pending) {
                remember({ required: true })
                if (queryClient.getQueryState(organizationReconciliationQueryKey))
                    queryClient.setQueryData(organizationReconciliationQueryKey, true)
            }
            if (issued) remember({ dismissed: true })
            clear()
            if (render) {
                setOperation(previous => ({
                    ...emptyOperation,
                    notice: issued || previous.notice === copy.dismissed ? copy.dismissed : '',
                }))
                setFormVersion(value => value + 1)
                if (pending) void refresh()
            }
        },
        [clear, queryClient, refresh, remember],
    )

    useLayoutEffect(() => {
        const forget = () => flushSync(() => dismiss())
        const restore = (event: PageTransitionEvent) => {
            if (event.persisted) forget()
        }
        window.addEventListener('pagehide', forget)
        window.addEventListener('pageshow', restore)
        return () => {
            window.removeEventListener('pagehide', forget)
            window.removeEventListener('pageshow', restore)
            dismiss(false)
        }
    }, [dismiss])

    async function create(body: CreateOrganization) {
        if (
            lifetime.current.pending ||
            invitation.current ||
            !navigator.onLine ||
            queryClient.getQueryData(organizationReconciliationQueryKey)
        )
            return
        clear()
        // Set the reload guard before dispatch; successful or rejected responses remove it.
        remember({ required: true, dismissed: false })
        const { generation, controller } = lifetime.current
        const current = () => generation === lifetime.current.generation && !controller.signal.aborted
        submitted.current = body
        lifetime.current.pending = 'create'
        setOperation({ ...emptyOperation, pending: 'create' })
        try {
            const result = await createOrganization(api, body, controller.signal)
            if (!current()) return
            // Direct generated requests never retain one-time data or variables in MutationCache.
            invitation.current = result
            remember({ required: false })
            setOperation({ ...emptyOperation, issued: true })
        } catch (error) {
            if (!current()) return
            invitation.current = null
            const notice =
                error instanceof ApiError && error.status === 400
                    ? copy.invalid
                    : error instanceof ApiError && error.status === 403
                      ? copy.rejected
                      : error instanceof ApiError && error.status === 409
                        ? copy.conflict
                        : ''
            if (!notice) {
                remember({ required: true })
                queryClient.setQueryData(organizationReconciliationQueryKey, true)
            } else remember({ required: false })
            setOperation({ ...emptyOperation, notice })
        } finally {
            if (current()) {
                body.name = ''
                body.ownerEmail = ''
                submitted.current = null
                lifetime.current.pending = null
                setFormVersion(value => value + 1)
                void refresh()
            }
        }
    }

    function copied() {
        remember({ dismissed: true })
        clear()
        setOperation({ ...emptyOperation, notice: copy.copied })
    }
    async function copyInvitation() {
        if (!invitation.current || lifetime.current.pending) return
        const { generation } = lifetime.current
        lifetime.current.pending = 'copy'
        setOperation(value => ({ ...value, pending: 'copy' }))
        try {
            await navigator.clipboard.writeText(invitation.current)
            if (generation === lifetime.current.generation) copied()
        } catch {
            if (generation === lifetime.current.generation) {
                lifetime.current.pending = null
                setOperation(value => ({ ...value, pending: null, notice: copy.copyFailed }))
            }
        }
    }
    return {
        directory,
        operation,
        formVersion,
        readInvitation,
        refresh,
        create,
        copied,
        copyInvitation,
        dismiss,
        unknown: reconciliation.data,
        reviewed: () => {
            if (!directory.isFetching && !directory.isError && directory.data) {
                remember({ required: false })
                queryClient.setQueryData(organizationReconciliationQueryKey, false)
                setOperation({ ...emptyOperation, notice: copy.recoveryReviewed })
            }
        },
    }
}
