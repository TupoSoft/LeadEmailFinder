import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthenticationService } from '../../application/authentication.service'
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

    it('rejects a non-public route when authentication fails', async () => {
        reflector.getAllAndOverride.mockReturnValue(false)
        authenticationService.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

        await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow(UnauthorizedException)
    })

    it('attaches the resolved principal to the request and allows the route', async () => {
        reflector.getAllAndOverride.mockReturnValue(false)
        const principal = { credentialKind: 'legacy_api_key' } as never
        authenticationService.authenticate.mockResolvedValue(principal)
        const request = { headers: { 'x-api-key': 'key' } }

        const result = await guard.canActivate(contextFor(request))

        expect(result).toBe(true)
        expect(getAuthPrincipal(request as never)).toBe(principal)
    })
})
