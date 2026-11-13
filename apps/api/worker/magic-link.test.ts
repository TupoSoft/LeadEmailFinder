import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { after, before, beforeEach, describe, it, mock } from 'node:test'
import { getPlatformProxy, type PlatformProxy } from 'wrangler'
import app from './app'
import type { WorkerEnvironment } from './auth'
import { createDatabase, type Database } from './database/connection'
import { account, rateLimit, session, user, verification } from './database/schema'

const origin = 'http://localhost:53000'
const secret = 'test-only-better-auth-secret-at-least-thirty-two-characters'
const requestPath = '/v1/auth/sign-in/magic-link'
const verifyPath = '/v1/auth/magic-link/verify'

let platform: PlatformProxy<Pick<Env, 'DB' | 'AUTH_EMAIL' | 'AUTH_MAIL_FROM'>>
let database: Database
let messages: EmailMessageBuilder[] = []
let deliveryError: Error | undefined

const captureEmail: Env['AUTH_EMAIL'] = {
    send(message) {
        assert.ok('text' in message, 'Authentication mail must use the composed text message API.')
        messages.push(message)

        if (deliveryError) {
            return Promise.reject(deliveryError)
        }

        return Promise.resolve({ messageId: randomUUID() })
    },
}

function environment(): WorkerEnvironment['Bindings'] {
    return {
        ...platform.env,
        AUTH_EMAIL: captureEmail,
        APP_BASE_URL: origin,
        BETTER_AUTH_SECRET: secret,
    }
}

async function request(path: string | URL, options: RequestInit = {}): Promise<Response> {
    return app.request(new Request(new URL(path, origin), options), undefined, environment())
}

function submit(body: unknown, ip = '192.0.2.30'): Promise<Response> {
    return request(requestPath, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify(body),
    })
}

function capturedLink(): URL {
    const text = messages.at(-1)?.text
    const link = text?.split('\n').find(line => line.startsWith(`${origin}${verifyPath}?`))

    assert.ok(link, 'The delivery binding must receive an actual Better Auth verification URL.')

    return new URL(link)
}

async function issueLink(email = `${randomUUID()}@example.test`, callbackURL = '/app'): Promise<URL> {
    const response = await submit({ email, callbackURL })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: true })

    return capturedLink()
}

function redeem(link: URL, ip = '192.0.2.31'): Promise<Response> {
    return request(link, { headers: { Accept: 'text/html', 'CF-Connecting-IP': ip } })
}

function assertInvalidLink(response: Response): void {
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), `${origin}/sign-in?error=invalid-link`)
    assert.deepEqual(response.headers.getSetCookie(), [])
}

function sessionCookie(response: Response): string {
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('better-auth.session_token='))

    assert.ok(cookie)
    assert.ok(cookie.includes('HttpOnly'))
    assert.ok(cookie.includes('SameSite=Lax'))
    assert.ok(cookie.includes('Path=/'))

    return cookie.split(';', 1)[0]
}

before(async () => {
    platform = await getPlatformProxy<Pick<Env, 'DB' | 'AUTH_EMAIL' | 'AUTH_MAIL_FROM'>>({
        configPath: resolve(__dirname, '../wrangler.jsonc'),
        persist: { path: resolve(__dirname, '../.wrangler/state/test/v3') },
        remoteBindings: false,
        envFiles: [],
    })
    database = createDatabase(platform.env.DB)
})

after(async () => {
    await platform?.dispose()
})

beforeEach(async () => {
    messages = []
    deliveryError = undefined

    await database.delete(session)
    await database.delete(account)
    await database.delete(user)
    await database.delete(verification)
    await database.delete(rateLimit)
})

void describe('public D1 Better Auth magic links', () => {
    void it('registers and later signs in the same verified user using only HttpOnly cookies', async () => {
        const email = 'new-person@example.test'
        const link = await issueLink(email, '/app/billing?view=credits')

        assert.deepEqual(await database.select().from(user), [])
        assert.deepEqual(await database.select().from(session), [])
        assert.equal(messages[0].to, email)

        const registered = await redeem(link)

        assert.equal(registered.status, 302)
        assert.equal(registered.headers.get('location'), `${origin}/app/billing?view=credits`)
        assert.equal(registered.headers.get('cache-control'), 'no-store')
        assert.equal(await registered.text(), '')

        const me = await request('/v1/me', { headers: { Cookie: sessionCookie(registered) } })
        const users = await database.select().from(user)
        const sessions = await database.select().from(session)

        assert.equal(users.length, 1)
        assert.equal(users[0].email, email)
        assert.equal(users[0].emailVerified, true)
        assert.equal(sessions.length, 1)
        assert.equal(sessions[0].userId, users[0].id)
        assert.equal(me.status, 200)
        assert.deepEqual(await me.json(), {
            user: { id: users[0].id, name: '', email, emailVerified: true, image: null },
        })

        const loginLink = await issueLink(email)
        const signedIn = await redeem(loginLink)

        assert.equal(signedIn.status, 302)
        assert.equal(signedIn.headers.get('location'), `${origin}/app`)
        assert.notEqual(sessionCookie(signedIn), sessionCookie(registered))
        assert.equal((await database.select().from(user)).length, 1)
        assert.equal((await database.select().from(session)).length, 2)
    })

    void it('stores only the SHA-256 token hash with an exact five-minute lifetime', async () => {
        const before = Date.now()
        const link = await issueLink()
        const records = await database.select().from(verification)
        const token = link.searchParams.get('token')

        assert.ok(token)
        assert.equal(records.length, 1)
        assert.equal(records[0].identifier, `magic-link:${createHash('sha256').update(token).digest('base64url')}`)
        assert.ok(!JSON.stringify(records).includes(token))
        assert.ok(records[0].expiresAt.getTime() >= before + 300_000)
        assert.ok(records[0].expiresAt.getTime() <= Date.now() + 300_000)
        assert.ok(messages[0].text?.includes('The link expires in 5 minutes and works once.'))
    })

    void it('allows exactly one concurrent redemption and rejects every replay', async () => {
        const link = await issueLink()

        const responses = await Promise.all(Array.from({ length: 8 }, () => redeem(link)))
        const successes = responses.filter(response => response.headers.getSetCookie().length > 0)
        const rejections = responses.filter(response => response.headers.getSetCookie().length === 0)

        assert.equal(successes.length, 1)
        assert.equal(rejections.length, 7)

        for (const response of rejections) {
            assertInvalidLink(response)
        }

        assert.equal((await database.select().from(session)).length, 1)
        assert.equal((await database.select().from(user)).length, 1)
        assert.deepEqual(await database.select().from(verification), [])
        assertInvalidLink(await redeem(link))
        assert.equal((await database.select().from(session)).length, 1)
    })

    void it('rejects an expired token without registering a user or issuing a session', async () => {
        const link = await issueLink()

        await database.update(verification).set({ expiresAt: new Date(Date.now() - 1) })

        assertInvalidLink(await redeem(link))
        assertInvalidLink(await redeem(link))
        assert.deepEqual(await database.select().from(user), [])
        assert.deepEqual(await database.select().from(session), [])
    })

    void it('persists request limits across fresh auth instances and allows recovery after the window', async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
            const response = await submit({ email: `${randomUUID()}@example.test` })

            assert.equal(response.status, 200)
        }

        const blocked = await submit({ email: `${randomUUID()}@example.test` })

        assert.equal(blocked.status, 429)
        assert.ok(Number(blocked.headers.get('retry-after')) > 0)
        assert.equal(messages.length, 5)
        assert.ok((await database.select().from(rateLimit)).some(record => record.count >= 5))

        await database.update(rateLimit).set({ lastRequest: Date.now() - 61_000 })

        assert.equal((await submit({ email: `${randomUUID()}@example.test` })).status, 200)
        assert.equal(messages.length, 6)
    })

    void it('persists redemption limits before revealing whether a token exists', async () => {
        const invalid = new URL(`${verifyPath}?token=nonexistent`, origin)

        for (let attempt = 0; attempt < 10; attempt++) {
            assertInvalidLink(await redeem(invalid))
        }

        const blocked = await redeem(invalid)

        assert.equal(blocked.status, 429)
        assert.ok(Number(blocked.headers.get('retry-after')) > 0)
        assert.deepEqual(await database.select().from(session), [])
    })

    void it('enforces the request budget when submissions arrive concurrently', async () => {
        const responses = await Promise.all(
            Array.from({ length: 12 }, () => submit({ email: `${randomUUID()}@example.test` })),
        )

        assert.equal(responses.filter(response => response.status === 200).length, 5)
        assert.equal(responses.filter(response => response.status === 429).length, 7)
        assert.equal(messages.length, 5)
        assert.equal((await database.select().from(verification)).length, 5)
    })

    void it('rejects unsafe callback fields before issuing or delivering a link', async () => {
        const unsafeDestinations = [
            'https://attacker.example/app',
            '//attacker.example/app',
            '/\\attacker.example/app',
            'javascript:alert(1)',
            `${origin}@attacker.example/app`,
            'https://localhost:53000/app',
            'http://localhost:53001/app',
        ]

        for (const field of ['callbackURL', 'newUserCallbackURL', 'errorCallbackURL']) {
            for (const destination of unsafeDestinations) {
                const response = await submit({ email: 'person@example.test', [field]: destination })

                assert.equal(response.status, 400, `${field} must reject ${destination}`)
                assert.deepEqual(response.headers.getSetCookie(), [])
            }
        }

        assert.deepEqual(messages, [])
        assert.deepEqual(await database.select().from(verification), [])
    })

    void it('rejects tampered callback fields without consuming the token or redirecting outside the application', async () => {
        const link = await issueLink()

        for (const field of ['callbackURL', 'newUserCallbackURL', 'errorCallbackURL']) {
            const tampered = new URL(link)
            tampered.searchParams.set(field, 'https://attacker.example/steal')

            assertInvalidLink(await redeem(tampered))
            assert.equal((await database.select().from(verification)).length, 1)
            assert.deepEqual(await database.select().from(session), [])
        }

        assert.equal((await redeem(link)).status, 302)
        assert.equal((await database.select().from(session)).length, 1)
    })

    void it('forces a safe redirect when callbackURL is omitted instead of returning native JSON credentials', async () => {
        const link = await issueLink()
        link.searchParams.delete('callbackURL')
        link.searchParams.delete('newUserCallbackURL')
        link.searchParams.delete('errorCallbackURL')

        const response = await redeem(link)

        assert.equal(response.status, 302)
        assert.equal(response.headers.get('location'), `${origin}/app`)
        sessionCookie(response)
        assert.equal(await response.text(), '')
    })

    void it('blocks JSON redemption, ambiguous queries, and alternate methods before consuming a token', async () => {
        const link = await issueLink()
        const jsonResponse = await request(link, { headers: { Accept: 'application/json' } })

        assert.equal(jsonResponse.status, 400)
        assert.deepEqual(jsonResponse.headers.getSetCookie(), [])

        for (const [key, value] of [
            ['disableRedirect', 'true'],
            ['token', 'other-token'],
            ['callbackURL', '/app/other'],
        ]) {
            const ambiguous = new URL(link)
            ambiguous.searchParams.append(key, value)

            assert.equal((await redeem(ambiguous)).status, 400)
        }

        for (const method of ['HEAD', 'POST']) {
            const response = await request(link, {
                method,
                headers: { Origin: origin, 'Content-Type': 'application/json' },
                body: method === 'POST' ? '{}' : undefined,
            })

            assert.equal(response.status, 404)
        }

        assert.equal((await database.select().from(verification)).length, 1)
        assert.deepEqual(await database.select().from(session), [])
        assert.equal((await redeem(link)).status, 302)
        assert.equal((await database.select().from(session)).length, 1)
    })

    void it('requires same-origin JSON submission and keeps unrelated native auth routes private', async () => {
        const body = JSON.stringify({ email: 'person@example.test' })

        assert.equal((await request(requestPath, { method: 'POST', body })).status, 403)
        assert.equal(
            (
                await request(requestPath, {
                    method: 'POST',
                    headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
                    body,
                })
            ).status,
            403,
        )
        assert.equal(
            (
                await request(requestPath, {
                    method: 'POST',
                    headers: { Origin: origin, 'Content-Type': 'text/plain' },
                    body,
                })
            ).status,
            415,
        )

        for (const path of [
            '/v1/auth/get-session',
            '/v1/auth/sign-up/email',
            `${requestPath}/`,
            `${requestPath}?extra=1`,
        ]) {
            const response = await request(path, {
                method: 'POST',
                headers: { Origin: origin, 'Content-Type': 'application/json' },
                body,
            })

            assert.equal(response.status, 404)
        }

        assert.deepEqual(messages, [])
        assert.deepEqual(await database.select().from(verification), [])
    })

    void it('returns generic confirmation for both registration and existing-account requests', async () => {
        const email = 'existing@example.test'
        const first = await submit({ email })
        const firstBody: unknown = await first.json()

        await redeem(capturedLink())

        const existing = await submit({ email })
        const newAddress = await submit({ email: 'another-person@example.test' })

        assert.equal(first.status, existing.status)
        assert.equal(existing.status, newAddress.status)
        assert.deepEqual(firstBody, { status: true })
        assert.deepEqual(await existing.json(), firstBody)
        assert.deepEqual(await newAddress.json(), firstBody)
        assert.equal((await database.select().from(user)).length, 1)
    })

    void it('reports delivery failure without creating a usable token or exposing provider details', async () => {
        deliveryError = new Error('Provider failure: private-recipient@example.test secret-token provider-credential')
        const errorLog = mock.method(console, 'error', () => undefined)

        try {
            const response = await submit({ email: 'private-recipient@example.test' })

            assert.equal(response.status, 503)
            assert.deepEqual(await response.json(), { code: 'magic_link_delivery_failed' })
            assert.deepEqual(response.headers.getSetCookie(), [])
            assert.deepEqual(await database.select().from(verification), [])
            assert.deepEqual(await database.select().from(user), [])
            assert.deepEqual(await database.select().from(session), [])
            assertInvalidLink(await redeem(capturedLink()))

            const logged = JSON.stringify(errorLog.mock.calls.map(call => call.arguments))

            assert.ok(!logged.includes('private-recipient'))
            assert.ok(!logged.includes('secret-token'))
            assert.ok(!logged.includes('provider-credential'))
        } finally {
            errorLog.mock.restore()
        }

        deliveryError = undefined
        const retry = await issueLink('private-recipient@example.test')

        assert.equal((await redeem(retry)).status, 302)
        assert.equal((await database.select().from(session)).length, 1)
    })
})
