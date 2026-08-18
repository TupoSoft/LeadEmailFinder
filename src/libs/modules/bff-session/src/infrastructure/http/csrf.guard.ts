import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { Request } from 'express'
import { BFF_CSRF_COOKIE_NAME, BFF_CSRF_HEADER_NAME } from './bff-cookie-names'
import { firstHeaderValue, parseCookieHeader } from './parse-cookie-header'

function timingSafeEqualStrings(a: string, b: string): boolean {
    const bufferA = Buffer.from(a)
    const bufferB = Buffer.from(b)

    return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

@Injectable()
export class CsrfGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>()
        const cookieToken = parseCookieHeader(firstHeaderValue(request.headers['cookie']))[BFF_CSRF_COOKIE_NAME]
        const headerToken = firstHeaderValue(request.headers[BFF_CSRF_HEADER_NAME])

        if (!cookieToken || !headerToken || !timingSafeEqualStrings(cookieToken, headerToken)) {
            throw new ForbiddenException('CSRF token is missing or invalid')
        }

        return true
    }
}
