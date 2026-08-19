import { UnauthorizedException } from '@nestjs/common'
import { OrganizationMembership } from '@tuposoft/lead-email-finder/modules/identity'
import { SessionRecord } from '../domain/session-record'
import { RedisSessionStore } from '../infrastructure/redis/redis-session-store'
import { BffSessionCredentialAuthenticator } from './bff-session-credential-authenticator'
import { HumanMembershipResolver } from './human-membership-resolver.service'
import { SessionRefreshFailedError, SessionTokenRefresher } from './session-token-refresher.service'

function sampleRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
    return {
        externalIdentityId: 'identity-1',
        organizationId: 'org-1',
        issuer: 'https://issuer',
        subject: 'human-1',
        csrfToken: 'csrf-token',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshTokenExpiresAt: Date.now() + 120_000,
        absoluteExpiresAt: Date.now() + 86_400_000,
        createdAt: Date.now(),
        ...overrides,
    }
}

describe('BffSessionCredentialAuthenticator', () => {
    let sessionStore: jest.Mocked<Pick<RedisSessionStore, 'get' | 'save' | 'delete'>>
    let sessionTokenRefresher: jest.Mocked<Pick<SessionTokenRefresher, 'refreshIfNeeded'>>
    let humanMembershipResolver: jest.Mocked<Pick<HumanMembershipResolver, 'resolveActive'>>
    let authenticator: BffSessionCredentialAuthenticator

    beforeEach(() => {
        sessionStore = { get: jest.fn(), save: jest.fn(), delete: jest.fn() }
        sessionTokenRefresher = { refreshIfNeeded: jest.fn() }
        humanMembershipResolver = { resolveActive: jest.fn() }
        authenticator = new BffSessionCredentialAuthenticator(
            sessionStore as unknown as RedisSessionStore,
            sessionTokenRefresher as unknown as SessionTokenRefresher,
            humanMembershipResolver as unknown as HumanMembershipResolver,
        )
    })

    describe('supports', () => {
        it('supports a session-cookie credential', () => {
            expect(authenticator.supports({ scheme: 'session-cookie', token: 'session-id' })).toBe(true)
        })

        it('does not support a bearer credential', () => {
            expect(authenticator.supports({ scheme: 'bearer', token: 'a.b.c' })).toBe(false)
        })

    })

    describe('authenticate', () => {
        it('throws when no session record is found', async () => {
            sessionStore.get.mockResolvedValue(undefined)

            await expect(authenticator.authenticate({ scheme: 'session-cookie', token: 'session-id' })).rejects.toThrow(
                UnauthorizedException,
            )
        })

        it('deletes the session and rejects when the refresh token is dead', async () => {
            const record = sampleRecord()
            sessionStore.get.mockResolvedValue(record)
            sessionTokenRefresher.refreshIfNeeded.mockRejectedValue(new SessionRefreshFailedError())

            await expect(authenticator.authenticate({ scheme: 'session-cookie', token: 'session-id' })).rejects.toThrow(
                UnauthorizedException,
            )
            expect(sessionStore.delete).toHaveBeenCalledWith('session-id')
        })

        it('rejects when the membership resolver rejects (e.g. disabled membership)', async () => {
            const record = sampleRecord()
            sessionStore.get.mockResolvedValue(record)
            sessionTokenRefresher.refreshIfNeeded.mockResolvedValue(record)
            humanMembershipResolver.resolveActive.mockRejectedValue(new UnauthorizedException('disabled'))

            await expect(authenticator.authenticate({ scheme: 'session-cookie', token: 'session-id' })).rejects.toThrow(
                UnauthorizedException,
            )
        })

        it('builds an AuthPrincipal from the refreshed record and resolved membership, and persists the refreshed record', async () => {
            const record = sampleRecord()
            const refreshedRecord = { ...record, accessToken: 'new-access-token' }
            sessionStore.get.mockResolvedValue(record)
            sessionTokenRefresher.refreshIfNeeded.mockResolvedValue(refreshedRecord)
            humanMembershipResolver.resolveActive.mockResolvedValue({ role: 'admin' } as OrganizationMembership)

            const principal = await authenticator.authenticate({ scheme: 'session-cookie', token: 'session-id' })

            expect(principal).toEqual({
                credentialKind: 'human_session',
                issuer: 'https://issuer',
                subject: 'human-1',
                organizationId: 'org-1',
                membershipRole: 'admin',
                permissions: [],
                credentialId: 'identity-1',
            })
            expect(sessionStore.save).toHaveBeenCalledWith('session-id', refreshedRecord)
        })

        it('never derives organizationId or membershipRole from anything other than the resolved membership record', async () => {
            const record = sampleRecord({ organizationId: 'true-organization-id' })
            sessionStore.get.mockResolvedValue(record)
            sessionTokenRefresher.refreshIfNeeded.mockResolvedValue(record)
            humanMembershipResolver.resolveActive.mockResolvedValue({
                organizationId: 'true-organization-id',
                role: 'owner',
            } as OrganizationMembership)

            const principal = await authenticator.authenticate({ scheme: 'session-cookie', token: 'session-id' })

            expect(principal.organizationId).toBe('true-organization-id')
            expect(principal.membershipRole).toBe('owner')
            expect(humanMembershipResolver.resolveActive).toHaveBeenCalledWith('true-organization-id', 'identity-1')
        })
    })
})
