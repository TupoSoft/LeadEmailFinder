import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { Request } from 'express'
import { BFF_CSRF_COOKIE_NAME, BFF_CSRF_HEADER_NAME } from './bff-cookie-names'
import { readPresentedCookie } from './parse-cookie-header'

function timingSafeEqualStrings(a: string, b: string): boolean {
    const bufferA = Buffer.from(a)
    const bufferB = Buffer.from(b)

    return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

@Injectable()
export class CsrfGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        return this.checkCsrf(context.switchToHttp().getRequest<Request>())
    }

    checkCsrf(request: Request): boolean {
        const cookieHeader = request.headers['cookie']
        const cookieToken =
            typeof cookieHeader === 'string' ? readPresentedCookie(cookieHeader, BFF_CSRF_COOKIE_NAME) : undefined
        const headerToken = request.headers[BFF_CSRF_HEADER_NAME]

        if (
            !cookieToken ||
            typeof headerToken !== 'string' ||
            !headerToken ||
            !timingSafeEqualStrings(cookieToken, headerToken)
        ) {
            throw new ForbiddenException('CSRF token is missing or invalid')
        }

        return true
    }
}
