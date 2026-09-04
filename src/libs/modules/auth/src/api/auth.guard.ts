import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { AuthenticationService } from '../application/authentication.service'
import { CredentialRejectedError } from '../application/credential-authenticator'
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

        let principal
        try {
            principal = await this.authenticationService.authenticate(request.headers)
        } catch (error) {
            if (error instanceof CredentialRejectedError) {
                throw new UnauthorizedException({ code: 'authentication_required' })
            }
            throw error
        }

        setAuthPrincipal(request, principal)

        return true
    }
}
