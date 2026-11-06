import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { nativeSessionCookieEffects } from '@tuposoft/lead-email-finder/better-auth'
import { AuthenticationService, CredentialRejectedError } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthenticationUnavailableError } from '@tuposoft/lead-email-finder/modules/bff-session'
import { BrowserAuthGuard } from './browser-auth.guard'

describe('BrowserAuthGuard cookie transport', () => {
    const append = jest.fn()
    const authenticate = jest.fn()
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector
    const guard = new BrowserAuthGuard(reflector, { authenticate } as unknown as AuthenticationService)
    const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => ({ headers: {}, rawHeaders: [] }), getResponse: () => ({ append }) }),
    } as unknown as ExecutionContext

    beforeEach(() => jest.clearAllMocks())

    it('resolves its inherited authentication dependencies through Nest injection', async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                BrowserAuthGuard,
                { provide: Reflector, useValue: reflector },
                { provide: AuthenticationService, useValue: { authenticate } },
            ],
        }).compile()
        try {
            authenticate.mockResolvedValue({ credentialKind: 'human_session' })
            await expect(moduleRef.get(BrowserAuthGuard).canActivate(context)).resolves.toBe(true)
            expect(authenticate).toHaveBeenCalledWith({})
        } finally {
            await moduleRef.close()
        }
    })

    function captureCookies(): void {
        const headers = new Headers()
        headers.append('Set-Cookie', 'lef_session=renewed; Path=/; HttpOnly')
        headers.append('Set-Cookie', 'native_cleanup=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/')
        nativeSessionCookieEffects.capture(headers)
    }

    it.each([false, true])('forwards every native cookie independently, rejection=%s', async rejected => {
        authenticate.mockImplementation(() => {
            captureCookies()
            if (rejected) return Promise.reject(new CredentialRejectedError('MFA required'))
            return Promise.resolve({ credentialKind: 'human_session' })
        })
        if (rejected) {
            await expect(guard.canActivate(context)).rejects.toMatchObject({
                status: 401,
                response: { code: 'authentication_required' },
            })
        } else {
            await expect(guard.canActivate(context)).resolves.toBe(true)
        }
        expect(append.mock.calls).toEqual([
            ['Set-Cookie', 'lef_session=renewed; Path=/; HttpOnly'],
            ['Set-Cookie', 'native_cleanup=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/'],
        ])
    })

    it('maps native unavailability to a redacted 503 and still forwards cleanup', async () => {
        authenticate.mockImplementation(() => {
            captureCookies()
            return Promise.reject(new AuthenticationUnavailableError())
        })
        await expect(guard.canActivate(context)).rejects.toMatchObject({
            status: 503,
            response: { code: 'authentication_unavailable' },
        })
        expect(append).toHaveBeenCalledTimes(2)
    })

    it('preserves unrelated machine infrastructure failures', async () => {
        const failure = new Error('machine database unavailable')
        authenticate.mockRejectedValue(failure)
        await expect(guard.canActivate(context)).rejects.toBe(failure)
        expect(append).not.toHaveBeenCalled()
    })
})
