import { useQuery } from '@tanstack/react-query'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ApiError } from '../../api/api-error'
import { useAuth } from '../auth/use-auth'
import {
    createServiceClient,
    deleteServiceClient,
    disableServiceClient,
    readServiceClients,
    rotateServiceClient,
    serviceClientsQueryKey,
    type CreateServiceClient,
    type IssuedServiceClient,
} from './service-clients-api'
import { serviceClientsCopy as copy } from './service-clients-copy'

type OperationKind = 'create' | 'rotate' | 'disable' | 'delete'
interface OperationState {
    pending: OperationKind | 'copy' | null
    issuedClientId: string | null
    unknown: 'create' | 'rotate' | null
    notice: string
}
const emptyState: OperationState = { pending: null, issuedClientId: null, unknown: null, notice: '' }

function failure(error: unknown, kind: OperationKind): Pick<OperationState, 'notice' | 'unknown'> {
    if (error instanceof ApiError) {
        if (error.status === 400) return { notice: copy.invalid, unknown: null }
        if (error.status === 403) return { notice: copy.rejected, unknown: null }
        if (error.status === 404) return { notice: copy.missing, unknown: null }
        if (error.status === 409) return { notice: copy.conflict, unknown: null }
    }
    return kind === 'create' || kind === 'rotate'
        ? { notice: '', unknown: kind }
        : { notice: copy.requestError, unknown: null }
}

export function useServiceClients(organizationId: string) {
    const { api } = useAuth()
    const clients = useQuery({
        queryKey: serviceClientsQueryKey(organizationId),
        queryFn: ({ signal }) => readServiceClients(api, organizationId, signal),
    })
    const [operation, setOperation] = useState<OperationState>(emptyState)
    const lifetime = useRef({ generation: 0, controller: new AbortController(), busy: false })
    const secret = useRef<string | null>(null)
    const objectUrl = useRef<string | null>(null)
    const readSecret = useCallback(() => secret.current ?? '', [])

    const clear = useCallback((render = true) => {
        lifetime.current.generation += 1
        lifetime.current.controller.abort()
        lifetime.current.controller = new AbortController()
        lifetime.current.busy = false
        secret.current = null
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = null
        window.getSelection()?.removeAllRanges()
        if (render) setOperation(emptyState)
    }, [])

    useLayoutEffect(() => {
        const forget = () => flushSync(() => clear())
        const restore = (event: PageTransitionEvent) => {
            if (event.persisted) forget()
        }
        window.addEventListener('pagehide', forget)
        window.addEventListener('pageshow', restore)
        return () => {
            window.removeEventListener('pagehide', forget)
            window.removeEventListener('pageshow', restore)
            clear(false)
        }
    }, [clear])

    async function run(kind: OperationKind, request: (signal: AbortSignal) => Promise<IssuedServiceClient | void>) {
        if (
            lifetime.current.busy ||
            !navigator.onLine ||
            ((kind === 'create' || kind === 'rotate') && operation.unknown)
        )
            return
        const previousUnknown = operation.unknown
        clear()
        const { generation, controller } = lifetime.current
        const current = () => generation === lifetime.current.generation && !controller.signal.aborted
        lifetime.current.busy = true
        setOperation({ ...emptyState, pending: kind, unknown: previousUnknown })
        try {
            const result = await request(controller.signal)
            if (!current()) return
            // Direct generated requests never enter MutationCache, including their variables and errors.
            // The one-time value lives only in this ref and the mounted dialog's uncontrolled input.
            secret.current = result?.clientSecret ?? null
            setOperation({
                ...emptyState,
                issuedClientId: result?.clientId ?? null,
                unknown: previousUnknown,
                notice: kind === 'disable' ? copy.disabled : kind === 'delete' ? copy.deleted : '',
            })
        } catch (error) {
            if (!current()) return
            const result = failure(error, kind)
            setOperation({ ...emptyState, ...result, unknown: result.unknown ?? previousUnknown })
        } finally {
            if (current()) {
                lifetime.current.busy = false
                void clients.refetch()
            }
        }
    }

    function dismiss() {
        const pending = operation.pending
        const unknown = pending === 'create' || pending === 'rotate' ? pending : operation.unknown
        const hadSecret = operation.issuedClientId !== null
        clear()
        setOperation({ ...emptyState, unknown, notice: hadSecret ? copy.closed : '' })
        if (pending && pending !== 'copy') void clients.refetch()
    }

    async function copySecret() {
        if (!secret.current || lifetime.current.busy) return
        const { generation } = lifetime.current
        lifetime.current.busy = true
        setOperation(value => ({ ...value, pending: 'copy' }))
        try {
            await navigator.clipboard.writeText(secret.current)
            if (generation === lifetime.current.generation)
                setOperation(value => ({ ...value, pending: null, notice: copy.copied }))
        } catch {
            if (generation === lifetime.current.generation)
                setOperation(value => ({ ...value, pending: null, notice: copy.copyFailed }))
        } finally {
            if (generation === lifetime.current.generation) lifetime.current.busy = false
        }
    }

    function download() {
        if (!secret.current || !operation.issuedClientId || lifetime.current.busy) return
        let anchor: HTMLAnchorElement | undefined
        try {
            const blob = new Blob(
                [JSON.stringify({ clientId: operation.issuedClientId, clientSecret: secret.current })],
                { type: 'application/json' },
            )
            objectUrl.current = URL.createObjectURL(blob)
            anchor = document.createElement('a')
            anchor.href = objectUrl.current
            anchor.download = 'service-client-credentials.json'
            document.body.append(anchor)
            anchor.click()
            setOperation(value => ({ ...value, notice: copy.downloaded }))
        } catch {
            setOperation(value => ({ ...value, notice: copy.downloadFailed }))
        } finally {
            anchor?.remove()
            if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
            objectUrl.current = null
        }
    }

    return {
        clients,
        operation,
        dismiss,
        copySecret,
        download,
        readSecret,
        reviewed: () => {
            if (!clients.isFetching && !clients.isError && clients.data)
                setOperation(value => ({ ...value, unknown: null, notice: copy.recoveryReviewed }))
        },
        create: (body: CreateServiceClient) =>
            run('create', signal => createServiceClient(api, organizationId, body, signal)),
        rotate: (id: string) => run('rotate', signal => rotateServiceClient(api, organizationId, id, signal)),
        disable: (id: string) => run('disable', signal => disableServiceClient(api, organizationId, id, signal)),
        remove: (id: string) => run('delete', signal => deleteServiceClient(api, organizationId, id, signal)),
    }
}
