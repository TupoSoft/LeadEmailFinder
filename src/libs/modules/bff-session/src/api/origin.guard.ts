import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { Request } from 'express'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../application/bff-session-configuration'
import { firstHeaderValue } from './parse-cookie-header'

@Injectable()
export class OriginGuard implements CanActivate {
    constructor(@Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BffSessionConfiguration) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>()
        const origin = firstHeaderValue(request.headers['origin']) ?? this.originFromReferer(request)
        const expectedOrigin = new URL(this.configuration.appBaseUrl).origin

        if (!origin || origin !== expectedOrigin) {
            throw new ForbiddenException('Request origin is not allowed')
        }

        return true
    }

    private originFromReferer(request: Request): string | undefined {
        const referer = firstHeaderValue(request.headers['referer'])

        if (!referer) {
            return undefined
        }

        try {
            return new URL(referer).origin
        } catch {
            return undefined
        }
    }
}
