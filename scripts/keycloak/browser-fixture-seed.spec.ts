import { BROWSER_FIXTURE_IDENTITIES, DEVELOPMENT_BROWSER_ISSUER } from './browser-fixture-identities'
import {
    assertBrowserFixtureIdentity,
    configureBrowserFixtureMfa,
    createBrowserSeedMetadata,
    findBrowserFixtureUser,
    generateBrowserFixtureResetId,
} from './browser-fixture-seed'
import type { KeycloakAdminPort } from './keycloak-admin-api'

const owner = {
    issuer: DEVELOPMENT_BROWSER_ISSUER,
    label: 'owner' as const,
    email: BROWSER_FIXTURE_IDENTITIES.owner.email,
    subject: 'owner-subject',
    newlyCreated: true,
}

function mockFixture(options: { otp?: boolean; actions?: string[]; roles?: string[]; email?: string } = {}): {
    api: jest.Mocked<KeycloakAdminPort>
    user: Record<string, unknown>
} {
    const user = {
        id: owner.subject,
        email: options.email ?? owner.email,
        username: owner.email,
        firstName: 'Invited',
        lastName: 'User',
        enabled: true,
        emailVerified: true,
        attributes: { custom: ['preserved'] },
        requiredActions: options.actions ?? ['VERIFY_EMAIL'],
    }
    const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
    api.request
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce((options.roles ?? ['owner', 'mfa_required']).map(name => ({ name })))
        .mockResolvedValueOnce(options.otp ? [{ type: 'password' }, { type: 'otp' }] : [{ type: 'password' }])
        .mockResolvedValueOnce(undefined)
    return { api, user }
}

describe('development browser fixture MFA scoping', () => {
    it.each([
        ['https://example.com/realms/lead-email-finder', owner.email],
        ['http://localhost:58081/realms/lead-email-finder', owner.email],
        ['http://localhost:58080/realms/another', owner.email],
        [DEVELOPMENT_BROWSER_ISSUER, 'someone@lef.test'],
    ])('rejects a different issuer or email before any admin call', async (issuer, email) => {
        const { api } = mockFixture()
        await expect(configureBrowserFixtureMfa(api, { ...owner, issuer, email })).rejects.toThrow('Refusing')
        expect(api.request).not.toHaveBeenCalled()
    })

    it('accepts an explicit issuer supplied by the checkout ownership validator', () => {
        const isolated = 'http://localhost:58084/realms/lead-email-finder'
        expect(() => assertBrowserFixtureIdentity(isolated, 'owner', owner.email, isolated)).not.toThrow()
    })

    it.each([
        'https://localhost:58084/realms/lead-email-finder',
        'http://example.com:58084/realms/lead-email-finder',
        'http://localhost/realms/lead-email-finder',
        'http://localhost:0/realms/lead-email-finder',
        'http://localhost:58084/realms/lead-email-finder?x=1',
    ])('refuses a non-development expected issuer', issuer => {
        expect(() => assertBrowserFixtureIdentity(issuer, 'owner', owner.email, issuer)).toThrow('Refusing')
    })

    it('appends enrollment only for a new exact fixture while preserving the full user representation', async () => {
        const { api, user } = mockFixture()
        await configureBrowserFixtureMfa(api, owner)
        expect(api.request).toHaveBeenLastCalledWith(
            'PUT',
            '/admin/realms/lead-email-finder/users/owner-subject',
            { ...user, requiredActions: ['VERIFY_EMAIL', 'CONFIGURE_TOTP'] },
            [204],
        )
        expect(
            api.request.mock.calls.every(
                ([method, path]) => method === 'GET' || (method === 'PUT' && path.endsWith('/users/owner-subject')),
            ),
        ).toBe(true)
    })

    it.each([
        ['member', 'mfa_required'],
        ['owner'],
        ['platform_admin', 'mfa_required'],
        ['owner', 'platform_admin', 'mfa_required'],
    ])('refuses missing or unexpected fixture roles: %j', async (...roles) => {
        const { api } = mockFixture({ roles })
        await expect(configureBrowserFixtureMfa(api, owner)).rejects.toThrow('expected role')
        expect(api.request.mock.calls.every(([method]) => method === 'GET')).toBe(true)
    })

    it('refuses an existing non-fixture or stale subject before admin calls', async () => {
        for (const previousSubject of [undefined, 'previous-realm-subject']) {
            const { api } = mockFixture()
            await expect(
                configureBrowserFixtureMfa(api, {
                    ...owner,
                    newlyCreated: false,
                    previousSubject,
                }),
            ).rejects.toThrow('provenance')
            expect(api.request).not.toHaveBeenCalled()
        }
    })

    it('refuses a user lookup that returns a different identity', async () => {
        const { api } = mockFixture({ email: 'someone@lef.test' })
        await expect(configureBrowserFixtureMfa(api, owner)).rejects.toThrow('does not match')
        expect(api.request).toHaveBeenCalledTimes(1)
    })

    it.each([{ otp: true }, { actions: ['CONFIGURE_TOTP'] }])(
        'does not modify an enrolled or enrollment-pending fixture on rerun',
        async options => {
            const { api } = mockFixture(options)
            await configureBrowserFixtureMfa(api, {
                ...owner,
                newlyCreated: false,
                previousSubject: owner.subject,
            })
            expect(api.request.mock.calls.every(([method]) => method === 'GET')).toBe(true)
        },
    )

    it('does not silently restore a removed enrollment credential on rerun', async () => {
        const { api } = mockFixture()
        await expect(
            configureBrowserFixtureMfa(api, {
                ...owner,
                newlyCreated: false,
                previousSubject: owner.subject,
            }),
        ).rejects.toThrow('lost its MFA')
        expect(api.request.mock.calls.every(([method]) => method === 'GET')).toBe(true)
    })

    it('rejects multiple matches even when the server was asked for an exact email', async () => {
        const { api, user } = mockFixture()
        api.request.mockReset().mockResolvedValue([user, user])
        await expect(findBrowserFixtureUser(api, owner.issuer, owner.label, owner.email)).rejects.toThrow('ambiguous')
    })
})

describe('nonsecret browser seed metadata', () => {
    it('has stable subjects, fixed roles, and a deterministic fingerprint that changes after either user is recreated', () => {
        const subjects = { owner: 'owner-1', platformOperator: 'operator-1' }
        const metadata = createBrowserSeedMetadata(subjects)
        expect(metadata).toEqual({
            version: 1,
            issuer: DEVELOPMENT_BROWSER_ISSUER,
            resetId: generateBrowserFixtureResetId(DEVELOPMENT_BROWSER_ISSUER, subjects),
            users: {
                owner: { ...BROWSER_FIXTURE_IDENTITIES.owner, subject: subjects.owner },
                platformOperator: {
                    ...BROWSER_FIXTURE_IDENTITIES.platformOperator,
                    subject: subjects.platformOperator,
                },
            },
        })
        expect(metadata.resetId).toMatch(/^[a-f0-9]{64}$/)
        for (const changed of [
            { ...subjects, owner: 'owner-2' },
            { ...subjects, platformOperator: 'operator-2' },
        ]) {
            expect(createBrowserSeedMetadata(changed).resetId).not.toBe(metadata.resetId)
        }
        expect(JSON.stringify(metadata)).not.toMatch(/password|secret|token|cookie|session/i)
    })

    it('rejects absent or shared subjects', () => {
        expect(() => createBrowserSeedMetadata({ owner: '', platformOperator: 'operator-1' })).toThrow('distinct')
        expect(() => createBrowserSeedMetadata({ owner: 'same', platformOperator: 'same' })).toThrow('distinct')
    })
})
