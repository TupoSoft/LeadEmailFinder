import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthenticationService } from '../application/authentication.service'
import { CredentialRejectedError } from '../application/credential-authenticator'
import { AuthGuard } from './auth.guard'
import { getAuthPrincipal } from './request-principal'

describe('AuthGuard', () => {
    let reflector: jest.Mocked<Reflector>
    let authenticationService: jest.Mocked<AuthenticationService>
    let guard: AuthGuard

    beforeEach(() => {
        reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>
        authenticationService = { authenticate: jest.fn() } as unknown as jest.Mocked<AuthenticationService>
        guard = new AuthGuard(reflector, authenticationService)
    })

    function contextFor(request: { headers: Record<string, string> }): ExecutionContext {
        return {
            getHandler: () => ({}),
            getClass: () => ({}),
            switchToHttp: () => ({ getRequest: () => request }),
        } as unknown as ExecutionContext
    }

    it('allows a public route without authenticating', async () => {
        reflector.getAllAndOverride.mockReturnValue(true)

        const result = await guard.canActivate(contextFor({ headers: {} }))

        expect(result).toBe(true)
        expect(authenticationService.authenticate).not.toHaveBeenCalled()
    })

    it('rejects a non-public route with the stable code-only 401 when authentication rejects the credential', async () => {
        reflector.getAllAndOverride.mockReturnValue(false)
        const rejection = new CredentialRejectedError('membership org-1 is disabled')

        authenticationService.authenticate.mockRejectedValue(rejection)

        await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toMatchObject({
            response: { code: 'authentication_required' },
            status: 401,
        })
    })

    it('propagates an unrecognized error from authenticate unchanged', async () => {
        reflector.getAllAndOverride.mockReturnValue(false)
        const unexpected = new Error('redis is down')
        authenticationService.authenticate.mockRejectedValue(unexpected)

        await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBe(unexpected)
    })

    it('attaches the resolved principal to the request and allows the route', async () => {
        reflector.getAllAndOverride.mockReturnValue(false)
        const principal = { credentialKind: 'human_session' } as never
        authenticationService.authenticate.mockResolvedValue(principal)
        const request = { headers: { authorization: 'Bearer token' } }

        const result = await guard.canActivate(contextFor(request))

        expect(result).toBe(true)
        expect(getAuthPrincipal(request as never)).toBe(principal)
    })
})
