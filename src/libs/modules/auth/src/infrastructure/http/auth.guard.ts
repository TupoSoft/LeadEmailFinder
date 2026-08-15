import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { AuthenticationService } from '../../application/authentication.service'
import { setAuthPrincipal } from './request-principal'

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly authenticationService: AuthenticationService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass(),
        ])

        if (isPublic) {
            return true
        }

        const request = context.switchToHttp().getRequest<Request>()
        const principal = await this.authenticationService.authenticate(request.headers)
        setAuthPrincipal(request, principal)

        return true
    }
}
