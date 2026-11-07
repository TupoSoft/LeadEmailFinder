import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { CsrfGuard } from './csrf.guard'

function contextFor(headers: Record<string, string | string[] | undefined>): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext
}

describe('CsrfGuard', () => {
    let guard: CsrfGuard

    beforeEach(() => {
        guard = new CsrfGuard()
    })

    it('allows a request where the header token matches the cookie token', () => {
        const context = contextFor({ cookie: 'lef_csrf_token=matching-token', 'x-csrf-token': 'matching-token' })

        expect(guard.canActivate(context)).toBe(true)
    })

    it('rejects when the CSRF cookie is missing', () => {
        const context = contextFor({ 'x-csrf-token': 'some-token' })

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })

    it('rejects when the CSRF header is missing', () => {
        const context = contextFor({ cookie: 'lef_csrf_token=some-token' })

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })

    it('rejects when the header token does not match the cookie token', () => {
        const context = contextFor({ cookie: 'lef_csrf_token=cookie-token', 'x-csrf-token': 'header-token' })

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })

    it('rejects duplicate cookies even when their final value matches the header', () => {
        const context = contextFor({
            cookie: 'lef_csrf_token=first; lef_csrf_token=matching',
            'x-csrf-token': 'matching',
        })
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })

    it('rejects when the tokens have different lengths', () => {
        const context = contextFor({ cookie: 'lef_csrf_token=short', 'x-csrf-token': 'a-much-longer-token-value' })

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })
    it('rejects repeated CSRF header values', () => {
        const context = contextFor({ cookie: 'lef_csrf_token=matching', 'x-csrf-token': ['matching', 'other'] })
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })
})
