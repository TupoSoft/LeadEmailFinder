import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { Response } from 'express'
import { AuthGuard } from '@tuposoft/lead-email-finder/modules/auth'
import { nativeSessionCookieEffects } from '@tuposoft/lead-email-finder/better-auth'
import { AuthenticationUnavailableError } from '@tuposoft/lead-email-finder/modules/bff-session'

/** Transport effects stay outside CredentialAuthenticator and its AuthPrincipal result. */
@Injectable()
export class BrowserAuthGuard extends AuthGuard {
    override async canActivate(context: ExecutionContext): Promise<boolean> {
        const response = context.switchToHttp().getResponse<Response>()
        return nativeSessionCookieEffects.run(
            async () => {
                try {
                    return await super.canActivate(context)
                } catch (error) {
                    if (error instanceof AuthenticationUnavailableError) {
                        throw new ServiceUnavailableException({ code: 'authentication_unavailable' })
                    }
                    throw error
                }
            },
            cookies => {
                for (const cookie of cookies) response.append('Set-Cookie', cookie)
            },
        )
    }
}
