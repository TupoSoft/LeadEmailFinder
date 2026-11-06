import { Request } from 'express'
import { ExecutionContext } from '@nestjs/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { BrowserSessionMutationGuard } from './browser-session-mutation.guard'
import { CsrfGuard } from './csrf.guard'
import { OriginGuard } from './origin.guard'

function principalFixture(overrides: Partial<AuthPrincipal>): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer',
        subject: 'human-1',
        organizationId: 'org-1',
        membershipRole: 'member',
        permissions: [],
        credentialId: 'identity-1',
        ...overrides,
    }
}

function contextFor(method: string, authPrincipal: AuthPrincipal | undefined): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => ({ method, authPrincipal }) }),
    } as unknown as ExecutionContext
}

describe('BrowserSessionMutationGuard', () => {
    let originGuard: jest.Mocked<Pick<OriginGuard, 'canActivate'>>
    let csrfGuard: jest.Mocked<Pick<CsrfGuard, 'canActivate'>>
    let guard: BrowserSessionMutationGuard

    beforeEach(() => {
        originGuard = { canActivate: jest.fn().mockReturnValue(true) }
        csrfGuard = { canActivate: jest.fn().mockReturnValue(true) }
        guard = new BrowserSessionMutationGuard(
            originGuard as unknown as OriginGuard,
            csrfGuard as unknown as CsrfGuard,
        )
    })

    it.each(['GET', 'HEAD', 'OPTIONS'])('allows a safe %s request without checking origin or CSRF', method => {
        expect(guard.canActivate(contextFor(method, principalFixture({})))).toBe(true)

        expect(originGuard.canActivate).not.toHaveBeenCalled()
        expect(csrfGuard.canActivate).not.toHaveBeenCalled()
    })

    it('allows an unsafe request with no principal (public route)', () => {
        expect(guard.canActivate(contextFor('POST', undefined))).toBe(true)

        expect(originGuard.canActivate).not.toHaveBeenCalled()
        expect(csrfGuard.canActivate).not.toHaveBeenCalled()
    })

    it('allows an unsafe service_client bearer request without checking origin or CSRF', () => {
        const principal = principalFixture({ credentialKind: 'service_client' })

        expect(guard.canActivate(contextFor('DELETE', principal))).toBe(true)

        expect(originGuard.canActivate).not.toHaveBeenCalled()
        expect(csrfGuard.canActivate).not.toHaveBeenCalled()
    })

    it('runs origin and CSRF checks for an unsafe human_session request', () => {
        const context = contextFor('POST', principalFixture({}))

        expect(guard.canActivate(context)).toBe(true)

        expect(originGuard.canActivate).toHaveBeenCalledWith(context)
        expect(csrfGuard.canActivate).toHaveBeenCalledWith(context)
    })

    it('short-circuits on a rejected origin check without invoking the CSRF check', () => {
        originGuard.canActivate.mockImplementation(() => {
            throw new Error('origin rejected')
        })

        expect(() => guard.canActivate(contextFor('PATCH', principalFixture({})))).toThrow('origin rejected')

        expect(csrfGuard.canActivate).not.toHaveBeenCalled()
    })

    it('rejects when the CSRF check fails after a passing origin check', () => {
        csrfGuard.canActivate.mockImplementation(() => {
            throw new Error('csrf rejected')
        })

        expect(() => guard.canActivate(contextFor('PUT', principalFixture({})))).toThrow('csrf rejected')

        expect(originGuard.canActivate).toHaveBeenCalled()
    })
    it('checks limited native-session mutations without requiring a business principal', () => {
        const origin = { checkOrigin: jest.fn().mockReturnValue(true) }
        const csrf = { checkCsrf: jest.fn().mockReturnValue(true) }
        const limitedGuard = new BrowserSessionMutationGuard(
            origin as unknown as OriginGuard,
            csrf as unknown as CsrfGuard,
        )
        const request = { method: 'POST', headers: {} } as Request

        expect(limitedGuard.checkSessionMutation(request)).toBe(true)
        expect(origin.checkOrigin).toHaveBeenCalledWith(request)
        expect(csrf.checkCsrf).toHaveBeenCalledWith(request)
    })
})
