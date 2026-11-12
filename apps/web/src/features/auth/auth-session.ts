import type { MutationFunctionContext, QueryClient, UseMutationOptions } from '@tanstack/react-query'
import type { ApiClient, Middleware } from '@tuposoft/lead-email-finder-api-client'
import { ApiError, normalizeApiError, StaleAuthResponseError } from '../../api/api-error'
import { createBrowserApiClient, type BrowserApiClientOptions } from '../../api/browser-api-client'
import { getCurrentAccount, type CurrentAccount } from '../../api/current-account'
import { createApplicationQueryClient, retrySafeRead } from './query-client'
import { authenticatedMutationOptions, type AuthenticationGeneration } from './authenticated-mutation'

export const currentAccountQueryKey = ['auth', 'current-account'] as const
export const sessionBoundaryChannelName = 'lef-session-boundary'
type BoundaryReason = 'sign-out' | 'principal-replaced'
export type AuthState =
    | { status: 'authenticated'; account: CurrentAccount; accessDenied: boolean }
    | {
          status:
              | 'loading'
              | 'unauthenticated'
              | 'session-expired'
              | 'account-unavailable'
              | 'unavailable'
              | 'signing-out'
              | 'signed-out'
              | 'logout-uncertain'
          error?: ApiError
      }

export interface BoundaryChannel {
    postMessage(message: { reason: BoundaryReason }): void
    close(): void
    onmessage: ((event: MessageEvent<unknown>) => void) | null
}

interface AuthSessionOptions extends BrowserApiClientOptions {
    queryClient?: QueryClient
    channelFactory?: () => BoundaryChannel | null
}

function openBoundaryChannel(): BoundaryChannel | null {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(sessionBoundaryChannelName)
}

function isBoundaryMessage(value: unknown): value is { reason: BoundaryReason } {
    return (
        typeof value === 'object' &&
        value !== null &&
        Object.keys(value).length === 1 &&
        'reason' in value &&
        (value.reason === 'sign-out' || value.reason === 'principal-replaced')
    )
}

/** Owns browser session transitions and the lifetime of all authenticated server state. */
export class AuthSession {
    readonly api: ApiClient
    readonly queryClient: QueryClient
    private state: AuthState = { status: 'loading' }
    private readonly listeners = new Set<() => void>()
    private generation = 0
    private abortController = new AbortController()
    private userId: string | undefined
    private hasAuthenticated = false
    private started = false
    private initialAccountAnnounced = false
    private suppressAccount = false
    private suppressedUserId: string | undefined
    private bootstrapPromise: Promise<void> | undefined
    private logoutPromise: Promise<void> | undefined
    private readonly channelFactory: () => BoundaryChannel | null
    private channel: BoundaryChannel | null = null
    private readonly boundaryErrors = new WeakMap<ApiError, number>()
    private readonly mutationExecutions = new WeakMap<MutationFunctionContext, AuthenticationGeneration>()

    constructor(options: AuthSessionOptions = {}) {
        this.queryClient = options.queryClient ?? createApplicationQueryClient()
        this.channelFactory = options.channelFactory ?? openBoundaryChannel
        this.api = createBrowserApiClient({
            ...options,
            authenticationBoundary: () => {
                const generation = this.generation
                return {
                    signal: this.abortController.signal,
                    assertCurrent: error => {
                        if (error instanceof ApiError && this.boundaryErrors.get(error) === this.generation) return
                        this.assertGeneration(generation)
                    },
                }
            },
        })
        this.api.use(this.createSessionMiddleware())
    }

    getSnapshot = (): AuthState => this.state

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    private setState(state: AuthState): void {
        this.state = state
        for (const listener of this.listeners) listener()
    }

    private assertGeneration(generation: number): void {
        if (generation !== this.generation) throw new StaleAuthResponseError()
    }

    private advance(state: AuthState): void {
        this.generation += 1
        this.abortController.abort()
        this.abortController = new AbortController()
        this.bootstrapPromise = undefined
        this.userId = undefined
        this.queryClient.clear()
        this.setState(state)
    }

    private publish(reason: BoundaryReason): void {
        try {
            this.channel?.postMessage({ reason })
        } catch {
            // A missing or closed channel must never prevent local session cleanup.
        }
    }

    private createSessionMiddleware(): Middleware {
        const requests = new WeakMap<Request, number>()
        return {
            onRequest: ({ request }) => {
                if (request.signal.aborted) throw new StaleAuthResponseError()
                const nextRequest = new Request(request, {
                    signal: AbortSignal.any([request.signal, this.abortController.signal]),
                    referrerPolicy: request.referrerPolicy,
                })
                requests.set(nextRequest, this.generation)
                return nextRequest
            },
            onResponse: async ({ request, response }) => {
                const generation = requests.get(request)
                if (generation === undefined) throw new StaleAuthResponseError()
                this.assertGeneration(generation)
                if (response.ok) return response
                const path = new URL(request.url).pathname
                const error = await normalizeApiError(response, path === '/v1/me')
                this.assertGeneration(generation)
                if (path !== '/v1/auth/sign-out') {
                    if (error.category === 'session-expired') {
                        this.advance({
                            status:
                                this.hasAuthenticated || this.suppressAccount ? 'session-expired' : 'unauthenticated',
                            error,
                        })
                        this.boundaryErrors.set(error, this.generation)
                    } else if (error.category === 'account-unavailable') {
                        this.advance({ status: 'account-unavailable', error })
                        this.boundaryErrors.set(error, this.generation)
                    } else if (error.category === 'access-denied' && this.state.status === 'authenticated') {
                        this.setState({ ...this.state, accessDenied: true })
                    }
                }
                throw error
            },
            onError: ({ request }) => {
                const generation = requests.get(request)
                if (generation === undefined) throw new StaleAuthResponseError()
                this.assertGeneration(generation)
                // Discard transport exception text, which may contain URLs or provider details.
                return new ApiError(0, 'request-failed')
            },
        }
    }

    bootstrap = (): Promise<void> => {
        if (this.bootstrapPromise) return this.bootstrapPromise
        this.started = true
        const generation = this.generation
        const previousUserId = this.userId
        this.setState({ status: 'loading' })
        const pending = this.queryClient
            .fetchQuery({
                queryKey: currentAccountQueryKey,
                staleTime: 0,
                retry: retrySafeRead,
                retryDelay: 250,
                queryFn: async ({ signal }) => {
                    const result = await getCurrentAccount(this.api, signal)
                    this.assertGeneration(generation)
                    if (!result.data) throw new ApiError(result.response.status, 'request-failed')
                    if (this.suppressAccount) {
                        // Another tab may bootstrap before the initiating tab's logout reaches the server.
                        if (this.suppressedUserId === undefined || this.suppressedUserId === result.data.user.id) {
                            this.advance({ status: 'logout-uncertain' })
                            throw new StaleAuthResponseError()
                        }
                        this.suppressAccount = false
                        this.suppressedUserId = undefined
                    }
                    if (previousUserId !== undefined && previousUserId !== result.data.user.id) {
                        this.advance({ status: 'loading' })
                        this.publish('principal-replaced')
                        this.installAccount(result.data)
                        // clear() cancelled this old query; it must never repopulate that cache entry.
                        throw new StaleAuthResponseError()
                    }
                    return result.data
                },
            })
            .then(account => {
                this.assertGeneration(generation)
                this.installAccount(account)
            })
            .catch((error: unknown) => {
                if (generation !== this.generation) return
                this.setState({ status: 'unavailable', error: error instanceof ApiError ? error : undefined })
            })
            .finally(() => {
                if (this.bootstrapPromise === pending) this.bootstrapPromise = undefined
            })
        this.bootstrapPromise = pending
        return pending
    }

    private installAccount(account: CurrentAccount): void {
        if (!this.initialAccountAnnounced) {
            // A peer's delayed bootstrap cannot consume this document's own first-account announcement.
            this.initialAccountAnnounced = true
            this.publish('principal-replaced')
        }
        this.userId = account.user.id
        this.hasAuthenticated = true
        this.queryClient.setQueryData(currentAccountQueryKey, account)
        this.setState({ status: 'authenticated', account, accessDenied: false })
    }

    clearAccessDenied = (): void => {
        if (this.state.status === 'authenticated' && this.state.accessDenied) {
            this.setState({ ...this.state, accessDenied: false })
        }
    }

    mutationOptions = <TData, TError = Error, TVariables = void, TContext = unknown>(
        options: UseMutationOptions<TData, TError, TVariables, TContext>,
    ): UseMutationOptions<TData, TError, TVariables, TContext> => {
        const generation = this.generation
        return authenticatedMutationOptions(
            options,
            {
                assertCurrent: () => this.assertGeneration(generation),
                isCurrent: () => generation === this.generation,
            },
            this.mutationExecutions,
        )
    }

    signOut = (): Promise<void> => {
        if (this.logoutPromise) return this.logoutPromise
        this.suppressedUserId ??= this.userId
        this.suppressAccount = true
        this.advance({ status: 'signing-out' })
        this.publish('sign-out')
        const generation = this.generation
        const pending = this.api
            .POST('/v1/auth/sign-out', { body: {} })
            .then(result => {
                this.assertGeneration(generation)
                if (result.response.status !== 200 || result.data?.success !== true) {
                    throw new ApiError(result.response.status, 'request-failed')
                }
                this.setState({ status: 'signed-out' })
            })
            .catch((error: unknown) => {
                if (generation !== this.generation) return
                this.setState({ status: 'logout-uncertain', error: error instanceof ApiError ? error : undefined })
            })
            .finally(() => {
                if (this.logoutPromise === pending) this.logoutPromise = undefined
            })
        this.logoutPromise = pending
        return pending
    }

    /** The provider flushes these browser event boundaries before the browser can paint restored content. */
    connect(flush: (work: () => void) => void = work => work()): () => void {
        try {
            this.channel = this.channelFactory()
        } catch {
            this.channel = null
        }
        if (this.channel) {
            this.channel.onmessage = ({ data }) => {
                if (!isBoundaryMessage(data)) return
                if (data.reason === 'sign-out') {
                    this.suppressedUserId ??= this.userId
                    this.suppressAccount = true
                }
                flush(() => this.advance({ status: 'loading' }))
                if (this.started) void this.bootstrap()
            }
        }
        const onPageShow = (event: PageTransitionEvent) => {
            if (!event.persisted || !this.started) return
            flush(() => this.advance({ status: 'loading' }))
            void this.bootstrap()
        }
        const onPageHide = () => {
            if (this.started) flush(() => this.advance({ status: 'loading' }))
        }
        window.addEventListener('pageshow', onPageShow)
        // A BFcache snapshot contains only the loading shell, even before pageshow is delivered.
        window.addEventListener('pagehide', onPageHide)
        return () => {
            window.removeEventListener('pageshow', onPageShow)
            window.removeEventListener('pagehide', onPageHide)
            if (this.channel) {
                this.channel.onmessage = null
                try {
                    this.channel.close()
                } catch {
                    // Channel cleanup cannot prevent cache and request cleanup.
                }
                this.channel = null
            }
            this.advance({ status: 'loading' })
        }
    }
}
