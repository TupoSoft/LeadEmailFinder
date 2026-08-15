import { Request } from 'express'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'

declare module 'express' {
    interface Request {
        authPrincipal?: AuthPrincipal
    }
}

export function setAuthPrincipal(request: Request, principal: AuthPrincipal): void {
    request.authPrincipal = principal
}

export function getAuthPrincipal(request: Request): AuthPrincipal | undefined {
    return request.authPrincipal
}
