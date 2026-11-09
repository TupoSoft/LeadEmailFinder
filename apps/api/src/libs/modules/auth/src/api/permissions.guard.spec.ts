import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { RolePermissionPolicy } from '../application/role-permission-policy.service'
import { PermissionsGuard } from './permissions.guard'
import { setAuthPrincipal } from './request-principal'

describe('PermissionsGuard', () => {
    let reflector: jest.Mocked<Reflector>
    let rolePermissionPolicy: jest.Mocked<RolePermissionPolicy>
    let guard: PermissionsGuard

    beforeEach(() => {
        reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>
        rolePermissionPolicy = { effectivePermissionsFor: jest.fn() } as unknown as jest.Mocked<RolePermissionPolicy>
        guard = new PermissionsGuard(reflector, rolePermissionPolicy)
    })

    function contextFor(request: Record<string, unknown>): ExecutionContext {
        return {
            getHandler: () => ({}),
            getClass: () => ({}),
            switchToHttp: () => ({ getRequest: () => request }),
        } as unknown as ExecutionContext
    }

    it('allows the request when no permissions are declared', () => {
        reflector.getAllAndOverride.mockReturnValue(undefined)

        expect(guard.canActivate(contextFor({}))).toBe(true)
        expect(rolePermissionPolicy.effectivePermissionsFor).not.toHaveBeenCalled()
    })

    it('throws UnauthorizedException when permissions are required but no principal is on the request', () => {
        reflector.getAllAndOverride.mockReturnValue(['platform:admin'])

        expect(() => guard.canActivate(contextFor({}))).toThrow(UnauthorizedException)
    })

    it('throws ForbiddenException when the principal lacks every required permission', () => {
        reflector.getAllAndOverride.mockReturnValue(['platform:admin'])
        rolePermissionPolicy.effectivePermissionsFor.mockReturnValue(['verification:run', 'verification:read'])
        const request: { authPrincipal?: AuthPrincipal } = {}
        setAuthPrincipal(request as never, { membershipRole: 'member' } as AuthPrincipal)

        expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenException)
    })

    it('allows the request when the principal has at least one required permission (any-of)', () => {
        reflector.getAllAndOverride.mockReturnValue(['platform:admin', 'billing:read'])
        rolePermissionPolicy.effectivePermissionsFor.mockReturnValue(['billing:read'])
        const request: { authPrincipal?: AuthPrincipal } = {}
        setAuthPrincipal(request as never, { membershipRole: 'owner' } as AuthPrincipal)

        expect(guard.canActivate(contextFor(request))).toBe(true)
    })

    it('reads permission metadata from both handler and class via getAllAndOverride (method overrides class)', () => {
        reflector.getAllAndOverride.mockReturnValue(['verification:run'])
        rolePermissionPolicy.effectivePermissionsFor.mockReturnValue(['verification:run'])
        const request: { authPrincipal?: AuthPrincipal } = {}
        setAuthPrincipal(request as never, { membershipRole: 'member' } as AuthPrincipal)

        guard.canActivate(contextFor(request))

        expect(reflector.getAllAndOverride).toHaveBeenCalledWith('requiredPermissions', [expect.anything(), expect.anything()])
    })
})
