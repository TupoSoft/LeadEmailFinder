import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { BffSessionConfiguration } from '../config/bff-session-configuration'
import { OriginGuard } from './origin.guard'

const configuration: BffSessionConfiguration = {
    appBaseUrl: 'http://localhost:53000',
    issuer: 'https://issuer',
    clientId: 'lef-web-bff',
    clientSecret: 'secret',
    sessionIdleTimeoutMs: 1000,
    sessionAbsoluteTimeoutMs: 2000,
    isSecureCookie: false,
}

function contextFor(headers: Record<string, string | undefined>): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext
}

describe('OriginGuard', () => {
    let guard: OriginGuard

    beforeEach(() => {
        guard = new OriginGuard(configuration)
    })

    it('allows a request with a matching Origin header', () => {
        expect(guard.canActivate(contextFor({ origin: 'http://localhost:53000' }))).toBe(true)
    })

    it('allows a request with a matching Referer origin when Origin is absent', () => {
        expect(guard.canActivate(contextFor({ referer: 'http://localhost:53000/some/page' }))).toBe(true)
    })

    it('rejects a request with a mismatched Origin header', () => {
        expect(() => guard.canActivate(contextFor({ origin: 'https://evil.example.test' }))).toThrow(ForbiddenException)
    })

    it('rejects a request with neither Origin nor Referer', () => {
        expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException)
    })

    it('rejects a request with a malformed Referer', () => {
        expect(() => guard.canActivate(contextFor({ referer: 'not-a-url' }))).toThrow(ForbiddenException)
    })
})
