import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@tuposoft/lead-email-finder-api-client'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ApiError } from '../../api/api-error'
import { useAuth } from '../auth/use-auth'
import {
    clearProxyCredentials,
    proxyDirectoryKey,
    readProxies,
    writeProxy,
    type ProxyOperation,
} from './platform-proxies-api'
import { proxyCopy as copy } from './platform-proxies-copy'

// Only a principal-scoped boolean survives route changes and the auth cache's BFCache reset.
const reconciliation = new WeakMap<ApiClient, { membershipId: string; required: boolean }>()

export function usePlatformProxies(membershipId: string) {
    const { api } = useAuth()
    const client = useQueryClient()
    const [pending, setPending] = useState(false)
    const [notice, setNotice] = useState('')
    const [unknown, setUnknown] = useState(() => {
        const marker = reconciliation.get(api)
        return marker?.membershipId === membershipId && marker.required
    })
    const [formVersion, setFormVersion] = useState(0)
    const lifetime = useRef({
        generation: 0,
        controller: new AbortController(),
        operation: null as ProxyOperation | null,
    })
    const remember = useCallback(
        (required: boolean) => {
            reconciliation.set(api, { membershipId, required })
            setUnknown(required)
        },
        [api, membershipId],
    )
    const directory = useInfiniteQuery({
        queryKey: proxyDirectoryKey,
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) => readProxies(api, pageParam, signal),
        getNextPageParam: page => page.nextPageToken || undefined,
        retry: false,
    })
    const refresh = useCallback(async () => {
        await client.cancelQueries({ queryKey: ['platform-proxies'] })
        await client.resetQueries({ queryKey: proxyDirectoryKey, exact: true })
        client.removeQueries({ queryKey: ['platform-proxies', 'detail'] })
    }, [client])
    const refreshLoaded = useCallback(async () => {
        await client.cancelQueries({ queryKey: ['platform-proxies'] })
        await client.invalidateQueries({ queryKey: proxyDirectoryKey, exact: true })
        client.removeQueries({ queryKey: ['platform-proxies', 'detail'] })
    }, [client])
    const invalidate = useCallback(() => {
        const active = lifetime.current.operation !== null
        if (active) reconciliation.set(api, { membershipId, required: true })
        lifetime.current.generation += 1
        lifetime.current.controller.abort()
        lifetime.current.controller = new AbortController()
        clearProxyCredentials(lifetime.current.operation)
        lifetime.current.operation = null
        window.getSelection()?.removeAllRanges()
        return active
    }, [api, membershipId])
    const dismiss = useCallback(() => {
        const active = invalidate()
        setPending(false)
        setFormVersion(value => value + 1)
        if (active) {
            setUnknown(true)
            setNotice('')
            void refresh()
        }
    }, [invalidate, refresh])

    useLayoutEffect(() => {
        const hide = () => flushSync(dismiss)
        const restore = (event: PageTransitionEvent) => {
            if (event.persisted) hide()
        }
        window.addEventListener('pagehide', hide)
        window.addEventListener('pageshow', restore)
        return () => {
            window.removeEventListener('pagehide', hide)
            window.removeEventListener('pageshow', restore)
            invalidate()
        }
    }, [dismiss, invalidate])

    async function run(operation: ProxyOperation) {
        const marker = reconciliation.get(api)
        if (
            lifetime.current.operation ||
            (marker?.membershipId === membershipId && marker.required) ||
            !navigator.onLine ||
            directory.isFetching ||
            directory.isError ||
            !directory.data
        ) {
            clearProxyCredentials(operation)
            return
        }
        invalidate()
        const { generation, controller } = lifetime.current
        const current = () => generation === lifetime.current.generation && !controller.signal.aborted
        lifetime.current.operation = operation
        reconciliation.set(api, { membershipId, required: true })
        setPending(true)
        setNotice('')
        try {
            // Credential variables never enter MutationCache, even while pending.
            await writeProxy(api, operation, controller.signal)
            if (!current()) return
            remember(false)
            setNotice(copy.success)
        } catch (error) {
            if (!current()) return
            const definite = error instanceof ApiError && [400, 401, 403, 404, 409, 422, 429].includes(error.status)
            remember(!definite)
            setNotice(
                definite
                    ? error.status === 403
                        ? copy.denied
                        : error.status === 404
                          ? copy.missing
                          : error.status === 409
                            ? copy.conflict
                            : copy.invalid
                    : '',
            )
        } finally {
            clearProxyCredentials(operation)
            if (current()) {
                lifetime.current.operation = null
                setPending(false)
                setFormVersion(value => value + 1)
                void (operation.kind === 'create' || operation.kind === 'delete' ? refresh() : refreshLoaded())
            }
        }
    }

    return {
        api,
        directory,
        pending,
        notice,
        unknown,
        formVersion,
        refresh,
        dismiss,
        run,
        reviewed: () => {
            if (directory.data && !directory.isFetching && !directory.isError && navigator.onLine) {
                remember(false)
                setNotice(copy.reviewedNotice)
            }
        },
    }
}
