import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- standard Express.Request declaration-merging pattern
    namespace Express {
        interface Request {
            authPrincipal?: AuthPrincipal
        }
    }
}

export function setAuthPrincipal(request: Express.Request, principal: AuthPrincipal): void {
    request.authPrincipal = principal
}

export function getAuthPrincipal(request: Express.Request): AuthPrincipal | undefined {
    return request.authPrincipal
}
