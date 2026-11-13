import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { magicLink } from 'better-auth/plugins/magic-link'
import { eq } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import type { AuthMailDelivery } from '../src/libs/better-auth/src'
import {
    createMagicLinkMessage,
    MAGIC_LINK_LIFETIME_SECONDS,
} from '../src/libs/better-auth/src/mail/magic-link-message'
import { createDatabase, type Database } from './database/connection'
import { account, rateLimit, session, user, verification } from './database/schema'

export interface AuthConfiguration {
    APP_BASE_URL: string
    BETTER_AUTH_SECRET: string
}

export type VerifiedUser = {
    id: string
    name: string
    email: string
    emailVerified: boolean
    image: string | null
}

export type WorkerEnvironment = {
    Bindings: Omit<Env, 'APP_BASE_URL'> & AuthConfiguration
    Variables: { requestId: string; user: VerifiedUser }
}

export function applicationOrigin(configuration: AuthConfiguration): string {
    let url: URL

    try {
        if (typeof configuration.APP_BASE_URL !== 'string') {
            throw new Error('Invalid URL type')
        }

        url = new URL(configuration.APP_BASE_URL)
    } catch {
        throw new Error('APP_BASE_URL must be an HTTP(S) origin.')
    }

    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
    ) {
        throw new Error('APP_BASE_URL must be an HTTP(S) origin.')
    }

    return url.origin
}

export function validateAuthConfiguration(configuration: AuthConfiguration): AuthConfiguration {
    const origin = applicationOrigin(configuration)
    const secret = configuration.BETTER_AUTH_SECRET

    if (typeof secret !== 'string' || secret.length < 32) {
        throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.')
    }

    return { APP_BASE_URL: origin, BETTER_AUTH_SECRET: secret }
}

async function hashMagicLinkToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))

    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

export function createAuth(
    database: Database,
    configuration: AuthConfiguration,
    mailDelivery?: AuthMailDelivery,
): ReturnType<typeof betterAuth> {
    const validatedConfiguration = validateAuthConfiguration(configuration)
    const origin = validatedConfiguration.APP_BASE_URL

    const options: BetterAuthOptions = {
        appName: 'Lead Email Finder',
        baseURL: origin,
        basePath: '/v1/auth',
        secret: validatedConfiguration.BETTER_AUTH_SECRET,
        trustedOrigins: [origin],
        database: drizzleAdapter(database, {
            provider: 'sqlite',
            transaction: false,
            schema: { user, session, account, verification, rateLimit },
        }),
        session: {
            expiresIn: 60 * 60 * 24 * 7,
            updateAge: 60 * 60 * 24,
            cookieCache: { enabled: false },
        },
        rateLimit: {
            enabled: true,
            storage: 'database',
            customRules: {
                '/sign-in/magic-link': { window: 60, max: 5 },
                '/magic-link/verify': { window: 60, max: 10 },
            },
        },
        plugins: [
            magicLink({
                expiresIn: MAGIC_LINK_LIFETIME_SECONDS,
                disableSignUp: false,
                storeToken: { type: 'custom-hasher', hash: hashMagicLinkToken },
                async sendMagicLink({ email, url, token }) {
                    try {
                        if (!mailDelivery) {
                            throw new Error('Authentication mail delivery is required.')
                        }

                        await mailDelivery.send(createMagicLinkMessage(email, url))
                    } catch {
                        // A failed delivery may have partially succeeded. Revoke its link before reporting failure.
                        await database
                            .delete(verification)
                            .where(eq(verification.identifier, `magic-link:${await hashMagicLinkToken(token)}`))

                        throw new APIError('SERVICE_UNAVAILABLE', {
                            code: 'magic_link_delivery_failed',
                            message: 'Could not send a sign-in link. Please try again.',
                        })
                    }
                },
            }),
        ],
        advanced: {
            database: { generateId: 'uuid' },
            ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
            useSecureCookies: origin.startsWith('https:'),
            defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
        },
        emailAndPassword: { enabled: false },
        telemetry: { enabled: false },
        // Driver errors may include SQL and personal data. The HTTP boundary logs a fixed event instead.
        logger: { disabled: true },
    }

    return betterAuth(options)
}

export const requireApplicationMutation: MiddlewareHandler<WorkerEnvironment> = async (context, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(context.req.method)) {
        return next()
    }

    const origin = applicationOrigin(context.env)

    if (context.req.header('Origin') !== origin) {
        return context.json({ code: 'origin_not_allowed' }, 403)
    }

    const contentType = context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase()

    if (contentType !== 'application/json') {
        return context.json({ code: 'json_required' }, 415)
    }

    return next()
}

export const requireVerifiedUser: MiddlewareHandler<WorkerEnvironment> = async (context, next) => {
    context.header('Cache-Control', 'no-store')

    const auth = createAuth(createDatabase(context.env.DB), context.env)
    const result = await auth.api.getSession({ headers: context.req.raw.headers, returnHeaders: true })

    for (const cookie of result.headers.getSetCookie()) {
        context.header('Set-Cookie', cookie, { append: true })
    }

    if (!result.response) {
        return context.json({ code: 'authentication_required' }, 401)
    }

    if (!result.response.user.emailVerified) {
        return context.json({ code: 'email_verification_required' }, 403)
    }

    const currentUser = result.response.user

    context.set('user', {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        emailVerified: currentUser.emailVerified,
        image: currentUser.image ?? null,
    })

    return next()
}

export const signOut: MiddlewareHandler<WorkerEnvironment> = async context => {
    context.header('Cache-Control', 'no-store')

    const url = new URL(context.req.url)

    // Only this exact native operation is public. Never forward aliases, query variants, or arbitrary auth paths.
    if (url.pathname !== '/v1/auth/sign-out' || url.search) {
        return context.text('Not Found', 404)
    }

    let body: unknown

    try {
        body = await context.req.raw.clone().json()
    } catch {
        return context.json({ code: 'invalid_request' }, 400)
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length !== 0) {
        return context.json({ code: 'invalid_request' }, 400)
    }

    const database = createDatabase(context.env.DB)
    const auth = createAuth(database, context.env)
    const currentSession = await auth.api.getSession({
        headers: context.req.raw.headers,
        query: { disableRefresh: true },
    })
    const response = await auth.handler(context.req.raw)

    if (response.status >= 500) {
        console.error(JSON.stringify({ event: 'sign_out_failed', requestId: context.get('requestId') }))

        return context.json({ code: 'sign_out_failed' }, 503)
    }

    if (response.ok && currentSession) {
        // Better Auth catches deletion errors internally. Do not confirm logout while the credential still works.
        const remainingSession = await database
            .select({ id: session.id })
            .from(session)
            .where(eq(session.id, currentSession.session.id))
            .get()

        if (remainingSession) {
            console.error(JSON.stringify({ event: 'session_revocation_failed', requestId: context.get('requestId') }))

            return context.json({ code: 'sign_out_failed' }, 503)
        }
    }

    return response
}
