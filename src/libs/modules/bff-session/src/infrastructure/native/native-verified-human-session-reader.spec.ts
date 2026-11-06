import { BetterAuthRuntime, nativeSessionCookieEffects } from '@tuposoft/lead-email-finder/better-auth'
import {
    AUTH_IDENTITY_ISSUER,
    ExternalIdentityResolver,
    ExternalIdentityStore,
} from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationUnavailableError } from '../../application/authentication-unavailable.error'
import {
    NativeHumanAuthFactsReaderAdapter,
    NativeVerifiedHumanSessionReader,
} from './native-verified-human-session-reader'

const NOW = Date.parse('2026-11-06T12:00:00.000Z')
const CREATED = NOW - 1_000
const EXPIRES = NOW + 8 * 60 * 60 * 1000
const ABSOLUTE_TIMEOUT = 24 * 60 * 60 * 1000

interface NativePayload {
    session: {
        id: string
        userId: string
        token: string
        createdAt: string
        expiresAt: string
        mfaVerifiedAt: number
        absoluteExpiresAt: number
    }
    user: { id: string; email: string; emailVerified: boolean; twoFactorEnabled: boolean }
    providerDetail: string
}

interface NativeSessionRequest {
    headers: Headers
    query: { disableCookieCache: boolean }
    asResponse: true
}

interface NativeReaderFixture {
    reader: NativeVerifiedHumanSessionReader
    getSession: jest.Mock<Promise<Response>, [NativeSessionRequest]>
    store: jest.Mocked<ExternalIdentityStore>
}

function payload(): NativePayload {
    return {
        session: {
            id: 'native-session',
            userId: 'native-user',
            token: 'must-not-escape',
            createdAt: new Date(CREATED).toISOString(),
            expiresAt: new Date(EXPIRES).toISOString(),
            mfaVerifiedAt: NOW,
            absoluteExpiresAt: NOW + 999_999_999,
        },
        user: { id: 'native-user', email: 'person@lef.test', emailVerified: true, twoFactorEnabled: true },
        providerDetail: 'must-not-escape',
    }
}

function fixture(baseUrl = 'http://localhost:53000'): NativeReaderFixture {
    const getSession = jest
        .fn<Promise<Response>, [NativeSessionRequest]>()
        .mockImplementation(() => Promise.resolve(Response.json(payload())))
    const store: jest.Mocked<ExternalIdentityStore> = {
        findByIssuerAndSubject: jest.fn().mockResolvedValue(undefined),
        updateEmail: jest.fn(),
        create: jest.fn().mockImplementation((issuer: string, subject: string, email: string) =>
            Promise.resolve({
                id: 'local-identity',
                issuer,
                subject,
                email,
            }),
        ),
    }
    const reader = new NativeVerifiedHumanSessionReader(
        { auth: { api: { getSession } } } as unknown as Pick<BetterAuthRuntime, 'auth'>,
        new ExternalIdentityResolver(store),
        { appBaseUrl: baseUrl, sessionAbsoluteTimeoutMs: ABSOLUTE_TIMEOUT },
    )
    return { reader, getSession, store }
}

describe('native verified human session reader', () => {
    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW))
    afterEach(() => jest.restoreAllMocks())

    it('creates a verified local identity without requiring membership and returns only safe session facts', async () => {
        const { reader, getSession, store } = fixture()
        expect(await reader.read('signed.credential')).toEqual({
            nativeUserId: 'native-user',
            externalIdentityId: 'local-identity',
            email: 'person@lef.test',
            emailVerified: true,
            sessionId: 'native-session',
            createdAt: CREATED,
            expiresAt: EXPIRES,
            absoluteExpiresAt: CREATED + ABSOLUTE_TIMEOUT,
            mfaVerifiedAt: 0,
        })
        expect(store.create).toHaveBeenCalledWith(AUTH_IDENTITY_ISSUER, 'native-user', 'person@lef.test')
        expect(getSession).toHaveBeenCalledWith({
            headers: expect.any(Headers),
            query: { disableCookieCache: true },
            asResponse: true,
        })
        const call = getSession.mock.calls[0][0]
        expect(call.headers.get('cookie')).toBe('lef_session=signed.credential')
    })

    it('uses stable native linkage and synchronizes email idempotently on repeated reads', async () => {
        const { reader, store } = fixture()
        store.findByIssuerAndSubject.mockResolvedValue({
            id: 'local-identity',
            issuer: AUTH_IDENTITY_ISSUER,
            subject: 'native-user',
            email: 'person@lef.test',
        })
        await reader.read('signed.credential')
        await reader.read('signed.credential')
        expect(store.create).not.toHaveBeenCalled()
        expect(store.updateEmail).not.toHaveBeenCalled()
        expect(store.findByIssuerAndSubject).toHaveBeenCalledWith(AUTH_IDENTITY_ISSUER, 'native-user')
    })

    it('uses the secure cookie name and encodes the credential rather than accepting cookie injection', async () => {
        const { reader, getSession } = fixture('https://app.example.test')
        await reader.read('value; forged=true')
        const call = getSession.mock.calls[0][0]
        expect(call.headers.get('cookie')).toBe('__Secure-lef_session=value%3B%20forged%3Dtrue')
    })

    it.each([
        ['unverified email', { user: { ...payload().user, emailVerified: false } }],
        ['mismatched identity', { session: { ...payload().session, userId: 'different-user' } }],
        ['expired idle deadline', { session: { ...payload().session, expiresAt: new Date(NOW).toISOString() } }],
        [
            'expired absolute deadline',
            { session: { ...payload().session, createdAt: new Date(NOW - ABSOLUTE_TIMEOUT).toISOString() } },
        ],
        ['malformed time', { session: { ...payload().session, createdAt: 'not-a-time' } }],
        ['future creation', { session: { ...payload().session, createdAt: new Date(NOW + 1).toISOString() } }],
    ])('does not create identity or authority for %s', async (_name, overrides) => {
        const { reader, getSession, store } = fixture()
        getSession.mockResolvedValue(Response.json({ ...payload(), ...overrides }))
        expect(await reader.read('signed.credential')).toBeUndefined()
        expect(store.create).not.toHaveBeenCalled()
    })

    it('treats missing, unknown, and concurrently revoked sessions as unusable and preserves cleanup cookies', async () => {
        const { reader, getSession } = fixture()
        expect(await reader.read('')).toBeUndefined()
        expect(getSession).not.toHaveBeenCalled()
        getSession.mockResolvedValueOnce(Response.json(null))
        expect(await reader.read('missing')).toBeUndefined()
        getSession.mockResolvedValueOnce(
            Response.json(
                { message: 'native-error-must-not-escape' },
                {
                    status: 401,
                    headers: { 'Set-Cookie': 'lef_session=; Max-Age=0' },
                },
            ),
        )
        const emit = jest.fn()
        await nativeSessionCookieEffects.run(async () => {
            expect(await reader.read('revoked')).toBeUndefined()
        }, emit)
        expect(emit).toHaveBeenCalledWith(['lef_session=; Max-Age=0'])
    })

    it('captures each renewal cookie on a valid session and when local identity persistence fails', async () => {
        const { reader, getSession, store } = fixture()
        const values = ['lef_session=renewed; HttpOnly', 'extra=; Expires=Thu, 01 Jan 1970 00:00:00 GMT']
        getSession.mockImplementation(() => {
            const headers = new Headers()
            for (const cookie of values) headers.append('Set-Cookie', cookie)
            return Promise.resolve(Response.json(payload(), { headers }))
        })
        const emit = jest.fn()
        await nativeSessionCookieEffects.run(() => reader.read('signed.credential'), emit)
        expect(emit).toHaveBeenCalledWith(values)
        store.findByIssuerAndSubject.mockRejectedValue(new Error('database detail must not escape'))
        await expect(nativeSessionCookieEffects.run(() => reader.read('signed.credential'), emit)).rejects.toEqual(
            new AuthenticationUnavailableError(),
        )
        expect(emit).toHaveBeenLastCalledWith(values)
    })

    it.each(['status', 'json', 'shape', 'network'])('redacts %s failures', async failure => {
        const { reader, getSession } = fixture()
        if (failure === 'status') getSession.mockResolvedValue(new Response('provider detail', { status: 503 }))
        if (failure === 'json') getSession.mockResolvedValue(new Response('provider detail'))
        if (failure === 'shape') getSession.mockResolvedValue(Response.json({ providerDetail: 'secret' }))
        if (failure === 'network') getSession.mockRejectedValue(new Error('provider detail'))
        await expect(reader.read('signed.credential')).rejects.toEqual(new AuthenticationUnavailableError())
    })

    it('projects enrollment separately without creating identity or treating it as session MFA proof', async () => {
        const { reader, store, getSession } = fixture()
        const facts = new NativeHumanAuthFactsReaderAdapter(reader)
        expect(await facts.read('signed.credential')).toEqual({ authenticatorEnrolled: true })
        expect(store.create).not.toHaveBeenCalled()
        getSession.mockResolvedValueOnce(
            Response.json({ ...payload(), user: { ...payload().user, twoFactorEnabled: false } }),
        )
        expect(await facts.read('signed.credential')).toEqual({ authenticatorEnrolled: false })
        getSession.mockResolvedValueOnce(Response.json(null))
        expect(await facts.read('missing')).toBeUndefined()
        getSession.mockRejectedValueOnce(new Error('provider detail'))
        await expect(facts.read('signed.credential')).rejects.toEqual(new AuthenticationUnavailableError())
    })
})
