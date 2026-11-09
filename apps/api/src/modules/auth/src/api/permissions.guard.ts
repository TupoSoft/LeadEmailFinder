import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { AuthPermission } from '@tuposoft/lead-email-finder/modules/identity'
import { RolePermissionPolicy } from '../application/role-permission-policy.service'
import { getAuthPrincipal } from './request-principal'
import { REQUIRED_PERMISSIONS_METADATA_KEY } from './require-permissions.decorator'

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly rolePermissionPolicy: RolePermissionPolicy,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredPermissions = this.reflector.getAllAndOverride<AuthPermission[]>(
            REQUIRED_PERMISSIONS_METADATA_KEY,
            [context.getHandler(), context.getClass()],
        )

        if (!requiredPermissions || requiredPermissions.length === 0) {
            return true
        }

        const request = context.switchToHttp().getRequest<Request>()
        const principal = getAuthPrincipal(request)

        if (!principal) {
            throw new UnauthorizedException('Authentication principal is missing')
        }

        const grantedPermissions = this.rolePermissionPolicy.effectivePermissionsFor(principal)
        const isPermitted = requiredPermissions.some(permission => grantedPermissions.includes(permission))

        if (!isPermitted) {
            throw new ForbiddenException('Missing required permission')
        }

        return true
    }
}
