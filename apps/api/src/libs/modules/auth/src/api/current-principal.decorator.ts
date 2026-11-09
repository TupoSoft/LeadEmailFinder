import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { getAuthPrincipal } from './request-principal'

export const CurrentPrincipal = createParamDecorator((_: unknown, context: ExecutionContext): AuthPrincipal => {
    const request = context.switchToHttp().getRequest<Request>()
    const principal = getAuthPrincipal(request)

    if (!principal) {
        throw new UnauthorizedException('Authentication principal is missing')
    }

    return principal
})
