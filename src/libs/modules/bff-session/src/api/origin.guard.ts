import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { Request } from 'express'
import { BFF_SESSION_CONFIGURATION, BrowserSessionConfiguration } from '../application/bff-session-configuration'

@Injectable()
export class OriginGuard implements CanActivate {
    constructor(@Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BrowserSessionConfiguration) {}

    canActivate(context: ExecutionContext): boolean {
        return this.checkOrigin(context.switchToHttp().getRequest<Request>())
    }

    checkOrigin(request: Request): boolean {
        const presentedOrigin = request.headers['origin']
        const origin =
            presentedOrigin === undefined
                ? this.originFromReferer(request)
                : typeof presentedOrigin === 'string'
                  ? presentedOrigin
                  : undefined
        const expectedOrigin = new URL(this.configuration.appBaseUrl).origin

        if (!origin || origin !== expectedOrigin) {
            throw new ForbiddenException('Request origin is not allowed')
        }

        return true
    }

    private originFromReferer(request: Request): string | undefined {
        const referer = request.headers['referer']

        if (typeof referer !== 'string' || !referer) {
            return undefined
        }

        try {
            return new URL(referer).origin
        } catch {
            return undefined
        }
    }
}
