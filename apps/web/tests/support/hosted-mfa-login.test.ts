// @vitest-environment node
import type { Page } from '@playwright/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BROWSER_FIXTURE_IDENTITIES } from '../../../../scripts/keycloak/browser-fixture-identities'
import { browserFixtureError, type BrowserSeedMetadata } from './browser-fixture-metadata'
import { hostedMfaLogin, signOutFixture } from './hosted-mfa-login'
import { generateTotp } from './totp'

const origin = 'http://localhost:53000'
const issuer = 'http://localhost:58080/realms/lead-email-finder'
// Published RFC 6238 test key; this value never comes from an enrolled fixture.
const publicTestKey = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const seed: BrowserSeedMetadata = {
    version: 1,
    issuer,
    resetId: 'test-reset',
    users: {
        owner: { ...BROWSER_FIXTURE_IDENTITIES.owner, subject: '7ddf443f-bd55-48eb-9fbd-e760e92d5f60' },
        platformOperator: {
            ...BROWSER_FIXTURE_IDENTITIES.platformOperator,
            subject: '8ba3e1f3-12b9-4fea-a6c9-11c39a4bb869',
        },
    },
}

interface HostedPageScenario {
    enrollment?: boolean
    signInHref?: string | null
    loginUrl?: string
    passwordResultUrl?: string
    loginFormAction?: string | null
    otpFormAction?: string | null
    manualKeyUrl?: string
    displayedKey?: string
    otpResults?: boolean[]
    otpErrorVisible?: boolean
    authenticatedUrl?: string
    account?: { email?: string; membership?: { role?: string } }
    accountStatus?: number
    rawError?: Error
}

// A controlled Page port exercises the authentication state transitions without creating accounts or cookies.
function hostedPage(scenario: HostedPageScenario = {}) {
    let currentUrl = `${origin}/`
    let authenticated = false
    const filled: Array<{ field: string; value: string }> = []
    const otpCodes: string[] = []
    let attempts = 0
    const signInClick = vi.fn(() => {
        currentUrl = scenario.loginUrl ?? `${issuer}/protocol/openid-connect/auth?session_code=synthetic`
        return Promise.resolve()
    })
    const passwordSubmit = vi.fn(() => {
        if (scenario.rawError) throw scenario.rawError
        currentUrl =
            scenario.passwordResultUrl ??
            `${issuer}/login-actions/${scenario.enrollment ? 'required-action' : 'authenticate'}`
        return Promise.resolve()
    })
    const otpSubmit = vi.fn(() => {
        const accepted = scenario.otpResults?.[attempts++] ?? true
        if (accepted) {
            authenticated = true
            currentUrl = scenario.authenticatedUrl ?? `${origin}/app`
        }
        return Promise.resolve()
    })
    const manualKeyClick = vi.fn(() => {
        if (scenario.manualKeyUrl) currentUrl = scenario.manualKeyUrl
        return Promise.resolve()
    })
    const signOutClick = vi.fn(() => {
        currentUrl = `${origin}/auth/signed-out`
        return Promise.resolve()
    })
    const evaluate = vi.fn(
        (callback: (expected: typeof seed.users.owner) => Promise<boolean>, expected: typeof seed.users.owner) =>
            callback(expected),
    )
    vi.stubGlobal(
        'fetch',
        vi.fn(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify(
                        scenario.account ?? {
                            email: seed.users.owner.email,
                            membership: { role: seed.users.owner.role },
                        },
                    ),
                    { status: scenario.accountStatus ?? 200 },
                ),
            ),
        ),
    )
    const goto = vi.fn((url: string) => {
        currentUrl = url
        return Promise.resolve()
    })

    const page = {
        goto,
        url: () => currentUrl,
        evaluate,
        locator: (selector: string) => ({
            fill: vi.fn((value: string) => {
                const field = ['#totp', '#otp'].includes(selector) ? 'One-time code' : selector
                filled.push({ field, value })
                if (field === 'One-time code') otpCodes.push(value)
                return Promise.resolve()
            }),
            waitFor: vi.fn(() => Promise.resolve()),
            count: vi.fn(() => Promise.resolve(selector === '#kc-totp-settings-form' && scenario.enrollment ? 1 : 0)),
            getAttribute: vi.fn(() =>
                Promise.resolve(
                    selector === '#kc-form-login'
                        ? scenario.loginFormAction === undefined
                            ? `${issuer}/login-actions/authenticate`
                            : scenario.loginFormAction
                        : scenario.otpFormAction === undefined
                          ? `${issuer}/login-actions/authenticate`
                          : scenario.otpFormAction,
                ),
            ),
            innerText: vi.fn(() => Promise.resolve(scenario.displayedKey ?? publicTestKey.match(/.{1,4}/g)!.join(' '))),
            isVisible: vi.fn(() => Promise.resolve(scenario.otpErrorVisible ?? true)),
        }),
        getByLabel: (field: string) => ({
            fill: vi.fn((value: string) => {
                filled.push({ field, value })
                if (field === 'One-time code') otpCodes.push(value)
                return Promise.resolve()
            }),
        }),
        getByRole: (role: string, options: { name: string | RegExp }) => ({
            getAttribute: vi.fn(() =>
                Promise.resolve(
                    scenario.signInHref === undefined ? '/v1/auth/login?destination=%2Fapp' : scenario.signInHref,
                ),
            ),
            fill: vi.fn((value: string) => {
                filled.push({ field: 'username', value })
                return Promise.resolve()
            }),
            waitFor: vi.fn(() => {
                if (options.name === 'Your workspace' && !authenticated) throw new Error('Unexpected workspace')
                return Promise.resolve()
            }),
            click:
                role === 'link'
                    ? options.name === 'Sign in'
                        ? signInClick
                        : manualKeyClick
                    : options.name === 'Sign out'
                      ? signOutClick
                      : options.name === 'Submit' || filled.some(entry => entry.field === 'One-time code')
                        ? otpSubmit
                        : passwordSubmit,
        }),
    } as unknown as Page
    return {
        page,
        goto,
        filled,
        otpCodes,
        evaluate,
        attempts: () => attempts,
        signInClick,
        passwordSubmit,
        otpSubmit,
        manualKeyClick,
        signOutClick,
    }
}

afterEach(() => vi.unstubAllGlobals())

describe('hosted MFA login', () => {
    it('enrolls through the hosted manual key view and confirms the owner account', async () => {
        const fixture = hostedPage({ enrollment: true })
        await expect(
            hostedMfaLogin({ page: fixture.page, identity: 'owner', origin, seed, now: () => 59_000 }),
        ).resolves.toBe(publicTestKey)
        expect(fixture.goto).toHaveBeenCalledWith(`${origin}/`)
        expect(fixture.signInClick).toHaveBeenCalledOnce()
        expect(fixture.manualKeyClick).toHaveBeenCalledOnce()
        expect(fixture.otpCodes).toEqual([generateTotp(publicTestKey, 59_000)])
        expect(fixture.evaluate).toHaveBeenCalledWith(expect.any(Function), seed.users.owner)
    })

    it('uses existing local material for a platform-operator challenge', async () => {
        const fixture = hostedPage({
            account: { email: seed.users.platformOperator.email, membership: { role: 'platform_admin' } },
        })
        await expect(
            hostedMfaLogin({
                page: fixture.page,
                identity: 'platformOperator',
                origin,
                seed,
                secret: publicTestKey,
                now: () => 59_000,
            }),
        ).resolves.toBe(publicTestKey)
        expect(fixture.manualKeyClick).not.toHaveBeenCalled()
        expect(fixture.otpSubmit).toHaveBeenCalledOnce()
        expect(fixture.evaluate).toHaveBeenCalledWith(expect.any(Function), seed.users.platformOperator)
    })

    it('rejects a password-only callback before accepting an account', async () => {
        const fixture = hostedPage({ passwordResultUrl: `${origin}/app` })
        await expect(
            hostedMfaLogin({ page: fixture.page, identity: 'owner', origin, seed, secret: publicTestKey }),
        ).rejects.toThrow(browserFixtureError().message)
        expect(fixture.otpSubmit).not.toHaveBeenCalled()
        expect(fixture.evaluate).not.toHaveBeenCalled()
    })

    it('fails before submitting a code when an enrolled identity has no local material', async () => {
        const fixture = hostedPage()
        await expect(hostedMfaLogin({ page: fixture.page, identity: 'owner', origin, seed })).rejects.toThrow(
            browserFixtureError().message,
        )
        expect(fixture.otpCodes).toHaveLength(0)
    })

    it('refuses a new enrollment page when local enrollment material already exists', async () => {
        const fixture = hostedPage({ enrollment: true })
        await expect(
            hostedMfaLogin({ page: fixture.page, identity: 'owner', origin, seed, secret: publicTestKey }),
        ).rejects.toThrow(browserFixtureError().message)
        expect(fixture.manualKeyClick).not.toHaveBeenCalled()
        expect(fixture.otpCodes).toHaveLength(0)
    })

    it.each([
        { signInHref: null },
        { signInHref: 'https://example.test/v1/auth/login' },
        { signInHref: '/v1/another/login' },
        { loginUrl: `${origin}/v1/auth/login` },
        { loginUrl: `${issuer}/unexpected-page` },
        { loginFormAction: null },
        { loginFormAction: 'https://example.test/realms/lead-email-finder/login-actions/authenticate' },
        { loginFormAction: 'http://localhost:58080/realms/another/login-actions/authenticate' },
    ])('rejects an untrusted entry page or form before filling credentials: case %#', async scenario => {
        const fixture = hostedPage(scenario)
        await expect(
            hostedMfaLogin({ page: fixture.page, identity: 'owner', origin, seed, secret: publicTestKey }),
        ).rejects.toThrow(browserFixtureError().message)
        expect(fixture.filled).toHaveLength(0)
        expect(fixture.passwordSubmit).not.toHaveBeenCalled()
    })

    it.each([
        { passwordResultUrl: 'https://example.test/realms/lead-email-finder/login-actions/authenticate' },
        { otpFormAction: `${origin}/v1/auth/callback` },
        { otpFormAction: 'http://localhost:58080/realms/another/login-actions/authenticate' },
        { enrollment: true, manualKeyUrl: 'https://example.test/login-actions/required-action' },
    ])('rejects a changed provider route or form before submitting an OTP: case %#', async scenario => {
        const fixture = hostedPage(scenario)
        await expect(
            hostedMfaLogin({
                page: fixture.page,
                identity: 'owner',
                origin,
                seed,
                secret: scenario.enrollment ? undefined : publicTestKey,
            }),
        ).rejects.toThrow(browserFixtureError().message)
        expect(fixture.otpCodes).toHaveLength(0)
    })

    it.each(['not-a-base32-key', `${publicTestKey}=`, `${publicTestKey}\n`, 'AAAB'])(
        'rejects malformed manual enrollment material: case %#',
        async displayedKey => {
            const fixture = hostedPage({ enrollment: true, displayedKey })
            await expect(hostedMfaLogin({ page: fixture.page, identity: 'owner', origin, seed })).rejects.toThrow(
                browserFixtureError().message,
            )
            expect(fixture.otpCodes).toHaveLength(0)
        },
    )

    it('waits only to the next OTP interval and retries once with the injected clock', async () => {
        const fixture = hostedPage({ otpResults: [false, true] })
        let clock = 59_999
        const wait = vi.fn((milliseconds: number) => {
            clock += milliseconds
            return Promise.resolve()
        })
        await expect(
            hostedMfaLogin({
                page: fixture.page,
                identity: 'owner',
                origin,
                seed,
                secret: publicTestKey,
                now: () => clock,
                wait,
            }),
        ).resolves.toBe(publicTestKey)
        expect(wait).toHaveBeenCalledExactlyOnceWith(101)
        expect(fixture.otpCodes).toEqual([generateTotp(publicTestKey, 59_999), generateTotp(publicTestKey, 60_100)])
        expect(fixture.attempts()).toBe(2)
    })

    it('fails after exactly two rejections and never attempts a third OTP', async () => {
        const fixture = hostedPage({ otpResults: [false, false, true] })
        let clock = 59_999
        const wait = vi.fn((milliseconds: number) => {
            clock += milliseconds
            return Promise.resolve()
        })
        await expect(
            hostedMfaLogin({
                page: fixture.page,
                identity: 'owner',
                origin,
                seed,
                secret: publicTestKey,
                now: () => clock,
                wait,
            }),
        ).rejects.toThrow(browserFixtureError().message)
        expect(wait).toHaveBeenCalledOnce()
        expect(fixture.attempts()).toBe(2)
    })

    it('does not retry when Keycloak has not identified an OTP validation error', async () => {
        const fixture = hostedPage({ otpResults: [false, true], otpErrorVisible: false })
        const wait = vi.fn()
        await expect(
            hostedMfaLogin({ page: fixture.page, identity: 'owner', origin, seed, secret: publicTestKey, wait }),
        ).rejects.toThrow(browserFixtureError().message)
        expect(wait).not.toHaveBeenCalled()
        expect(fixture.attempts()).toBe(1)
    })

    it.each([
        { account: { email: seed.users.owner.email, membership: { role: 'member' } } },
        { account: { email: seed.users.platformOperator.email, membership: { role: 'owner' } } },
        { accountStatus: 401 },
        { authenticatedUrl: `${origin}/app?code=synthetic&state=synthetic` },
        { authenticatedUrl: `${origin}/app#synthetic` },
        { authenticatedUrl: `${origin}/auth/error` },
    ])('rejects an unexpected callback or current-account identity: case %#', async scenario => {
        const fixture = hostedPage(scenario)
        await expect(
            hostedMfaLogin({ page: fixture.page, identity: 'owner', origin, seed, secret: publicTestKey }),
        ).rejects.toThrow(browserFixtureError().message)
    })

    it('withholds raw provider errors, HTML, and callback query text', async () => {
        const fixture = hostedPage({
            rawError: new Error(
                'SyntheticPrivateText <input value="synthetic-code"> ?code=synthetic-code&state=synthetic-state',
            ),
        })
        const error = await hostedMfaLogin({
            page: fixture.page,
            identity: 'owner',
            origin,
            seed,
            secret: publicTestKey,
        }).catch((error: unknown) => error)
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe(browserFixtureError().message)
        expect((error as Error).stack).not.toContain('SyntheticPrivateText')
    })

    it('signs out using the application control', async () => {
        const fixture = hostedPage()
        await signOutFixture(fixture.page)
        expect(fixture.signOutClick).toHaveBeenCalledOnce()
    })
})
