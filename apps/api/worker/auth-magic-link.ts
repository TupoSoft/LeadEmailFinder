import type { MiddlewareHandler } from 'hono'
import { z } from 'zod'
import { createAuthMailDelivery } from './auth-mail'
import { applicationOrigin, createAuth, type WorkerEnvironment } from './auth'
import { createDatabase } from './database/connection'

const requestPath = '/v1/auth/sign-in/magic-link'
const verificationPath = '/v1/auth/magic-link/verify'
const errorDestination = '/sign-in?error=invalid-link'
const callbackFields = ['callbackURL', 'newUserCallbackURL', 'errorCallbackURL'] as const
const verificationParameters = new Set(['token', ...callbackFields])
const submissionSchema = z
    .object({
        email: z.email().transform(email => email.toLowerCase()),
        callbackURL: z.string().optional(),
        newUserCallbackURL: z.string().optional(),
        errorCallbackURL: z.string().optional(),
    })
    .strict()

function safeDestination(value: string, origin: string): string | null {
    const hasControlCharacter = Array.from(value).some(character => {
        const code = character.charCodeAt(0)

        return code <= 32 || code === 127
    })

    // Reject browser URL repairs and ambiguous encoded separators before parsing.
    if (
        !value ||
        value.trim() !== value ||
        value.includes('\\') ||
        hasControlCharacter ||
        /%(?:0[0-9a-f]|1[0-9a-f]|2f|5c|7f)/i.test(value) ||
        value.startsWith('//') ||
        (!value.startsWith('/') && !/^https?:\/\//i.test(value))
    ) {
        return null
    }

    try {
        const destination = new URL(value, origin)

        if (destination.origin !== origin || destination.username || destination.password) {
            return null
        }

        return destination.href
    } catch {
        return null
    }
}

function browserAuthResponse(response: Response): Response {
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'no-store')
    headers.set('Referrer-Policy', 'no-referrer')

    const retryAfter = headers.get('X-Retry-After')

    if (retryAfter) {
        headers.set('Retry-After', retryAfter)
    }

    return new Response(response.body, { status: response.status, headers })
}

export const requestMagicLink: MiddlewareHandler<WorkerEnvironment> = async context => {
    context.header('Cache-Control', 'no-store')
    context.header('Referrer-Policy', 'no-referrer')

    const incomingURL = new URL(context.req.url)

    if (incomingURL.pathname !== requestPath || incomingURL.search) {
        return context.text('Not Found', 404)
    }

    let body: unknown

    try {
        body = await context.req.raw.json()
    } catch {
        return context.json({ code: 'invalid_request' }, 400)
    }

    const submission = submissionSchema.safeParse(body)

    if (!submission.success) {
        return context.json({ code: 'invalid_request' }, 400)
    }

    const origin = applicationOrigin(context.env)
    const callbacks: Partial<Record<(typeof callbackFields)[number], string>> = {}

    for (const field of callbackFields) {
        const value = submission.data[field]

        if (value === undefined) {
            continue
        }

        const destination = safeDestination(value, origin)

        if (!destination) {
            return context.json({ code: 'invalid_request' }, 400)
        }

        callbacks[field] = destination
    }

    const callbackURL = callbacks.callbackURL ?? `${origin}/app`
    const request = new Request(`${origin}${requestPath}`, {
        method: 'POST',
        headers: context.req.raw.headers,
        body: JSON.stringify({
            email: submission.data.email,
            callbackURL,
            newUserCallbackURL: callbacks.newUserCallbackURL ?? callbackURL,
            errorCallbackURL: `${origin}${errorDestination}`,
        }),
    })
    const auth = createAuth(createDatabase(context.env.DB), context.env, createAuthMailDelivery(context.env))
    const response = await auth.handler(request)

    if (response.status >= 500) {
        console.error(JSON.stringify({ event: 'magic_link_request_failed', requestId: context.get('requestId') }))

        return context.json({ code: 'magic_link_delivery_failed' }, 503)
    }

    if (response.ok) {
        // Registration happens on redemption. Existing and new addresses get the same confirmation.
        return context.json({ status: true })
    }

    return browserAuthResponse(response)
}

export const redeemMagicLink: MiddlewareHandler<WorkerEnvironment> = async context => {
    context.header('Cache-Control', 'no-store')
    context.header('Referrer-Policy', 'no-referrer')

    const incomingURL = new URL(context.req.url)

    // Hono also dispatches HEAD to GET handlers. Never consume a link for a HEAD request.
    if (context.req.method !== 'GET' || incomingURL.pathname !== verificationPath) {
        return context.text('Not Found', 404)
    }

    if (context.req.header('Accept')?.toLowerCase().includes('application/json')) {
        return context.json({ code: 'invalid_request' }, 400)
    }

    for (const key of incomingURL.searchParams.keys()) {
        if (!verificationParameters.has(key) || incomingURL.searchParams.getAll(key).length !== 1) {
            return context.json({ code: 'invalid_request' }, 400)
        }
    }

    const origin = applicationOrigin(context.env)
    const failureURL = `${origin}${errorDestination}`
    const token = incomingURL.searchParams.get('token')

    if (!token) {
        return context.redirect(failureURL, 302)
    }

    const callbacks: Partial<Record<(typeof callbackFields)[number], string>> = {}

    for (const field of callbackFields) {
        const value = incomingURL.searchParams.get(field)

        if (value === null) {
            continue
        }

        const destination = safeDestination(value, origin)

        if (!destination) {
            return context.redirect(failureURL, 302)
        }

        callbacks[field] = destination
    }

    const callbackURL = callbacks.callbackURL ?? `${origin}/app`
    const newUserCallbackURL = callbacks.newUserCallbackURL ?? callbackURL
    const nativeURL = new URL(verificationPath, origin)

    nativeURL.searchParams.set('token', token)
    nativeURL.searchParams.set('callbackURL', callbackURL)
    nativeURL.searchParams.set('newUserCallbackURL', newUserCallbackURL)
    nativeURL.searchParams.set('errorCallbackURL', failureURL)

    const auth = createAuth(createDatabase(context.env.DB), context.env)
    const response = await auth.handler(new Request(nativeURL, { headers: context.req.raw.headers }))
    const location = response.headers.get('Location')

    if (response.status >= 300 && response.status < 400) {
        if (location === callbackURL || location === newUserCallbackURL) {
            return browserAuthResponse(response)
        }

        return context.redirect(failureURL, 302)
    }

    if (response.status === 429) {
        return browserAuthResponse(response)
    }

    // Native session objects and tokens must never cross the public browser boundary.
    return context.redirect(failureURL, 302)
}
