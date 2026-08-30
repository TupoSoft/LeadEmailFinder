import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Request } from 'express'
import { getAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { CsrfGuard } from './csrf.guard'
import { OriginGuard } from './origin.guard'

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

@Injectable()
export class BrowserSessionMutationGuard implements CanActivate {
    constructor(
        private readonly originGuard: OriginGuard,
        private readonly csrfGuard: CsrfGuard,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>()

        if (SAFE_METHODS.has(request.method)) {
            return true
        }

        const principal = getAuthPrincipal(request)

        if (principal?.credentialKind !== 'human_session') {
            return true
        }

        return this.originGuard.canActivate(context) && this.csrfGuard.canActivate(context)
    }
}
