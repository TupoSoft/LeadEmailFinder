import { Test, TestingModule } from '@nestjs/testing'
import { MicrosoftLogin } from './microsoft-login.service'
import { HttpService } from '@nestjs/axios'
import { Logger } from '@nestjs/common'
import { of, Subject, throwError } from 'rxjs'

describe('MicrosoftLogin', () => {
    let microsoftLogin: jest.Mocked<MicrosoftLogin>
    let httpService: jest.Mocked<HttpService>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MicrosoftLogin,
                {
                    provide: HttpService,
                    useValue: {
                        post: jest.fn(),
                    },
                },
            ],
        }).compile()

        microsoftLogin = module.get(MicrosoftLogin)
        httpService = module.get(HttpService)
    })

    it.each([50126, 50079, 50076, 50158])('should return true for account-existence error code %s', async errorCode => {
        const responseError = {
            response: {
                data: {
                    error_codes: [errorCode],
                },
            },
        }

        httpService.post.mockReturnValue(throwError(responseError))

        const result = await microsoftLogin.verify('test@example.com')
        expect(result).toBe(true)
    })

    it.each([null, {}, { response: { data: null } }, { response: { data: { error_codes: [] } } }])(
        'should return false for malformed or empty error data %j',
        async error => {
            httpService.post.mockReturnValueOnce(throwError(() => error))

            await expect(microsoftLogin.verify('test@example.com')).resolves.toBe(false)
            expect(httpService.post).toHaveBeenCalledTimes(1)
        },
    )

    it('should retain its source and send one request with the existing payload and headers', async () => {
        httpService.post.mockReturnValueOnce(of({ data: {} } as any))

        await microsoftLogin.verify('test+fixture@example.com')

        expect(microsoftLogin.sourceName).toBe('microsoft_1')
        expect(httpService.post).toHaveBeenCalledTimes(1)
        expect(httpService.post).toHaveBeenCalledWith(
            'https://login.microsoft.com/common/oauth2/token',
            {
                resource: 'https://graph.windows.net',
                client_id: '1b730954-1685-4b74-9bfd-dac224a7b894',
                client_info: '1',
                grant_type: 'password',
                password: 'Password1',
                scope: 'openid',
                username: 'test+fixture@example.com',
            },
            {
                headers: {
                    'User-Agent': 'Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.12026; Pro',
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            },
        )
    })

    it('should suppress remote errors without logging disclosed data', async () => {
        const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)
        const email = 'microsoft-login-sentinel@example.test'
        const encodedEmail = encodeURIComponent(email)
        const error = Object.assign(new Error(`Provider echoed ${email} and ${encodedEmail}`), {
            response: { data: 'provider response body sentinel' },
            credential: 'provider credential sentinel',
        })
        httpService.post.mockReturnValueOnce(throwError(() => error))

        try {
            await expect(microsoftLogin.verify(email)).resolves.toBe(false)
            expect(debug).not.toHaveBeenCalled()
        } finally {
            debug.mockRestore()
        }
    })

    it('should return false if error is not a MicrosoftError', async () => {
        httpService.post.mockReturnValue(throwError(new Error('Network error')))

        const result = await microsoftLogin.verify('test@example.com')
        expect(result).toBe(false)
    })

    it('should return false if no relevant error codes are present', async () => {
        const responseError = {
            response: {
                data: {
                    error_codes: ['SomeOtherErrorCode'],
                },
            },
        }

        httpService.post.mockReturnValue(throwError(responseError))

        const result = await microsoftLogin.verify('test@example.com')
        expect(result).toBe(false)
    })

    it('should keep request bodies isolated while verification calls overlap', async () => {
        const firstResponse = new Subject<any>()
        const secondResponse = new Subject<any>()

        httpService.post.mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse)

        const firstResult = microsoftLogin.verify('first@example.com')
        const secondResult = microsoftLogin.verify('second@example.com')

        const firstBody = httpService.post.mock.calls[0][1]
        const secondBody = httpService.post.mock.calls[1][1]

        expect(httpService.post).toHaveBeenCalledTimes(2)
        expect(firstBody).toEqual(expect.objectContaining({ username: 'first@example.com' }))
        expect(secondBody).toEqual(expect.objectContaining({ username: 'second@example.com' }))
        expect(firstBody).not.toBe(secondBody)

        secondResponse.next({ data: {} })
        secondResponse.complete()
        firstResponse.next({ data: {} })
        firstResponse.complete()

        await expect(Promise.all([firstResult, secondResult])).resolves.toEqual([false, false])
    })

    it('should return false if HTTP request succeeds', async () => {
        httpService.post.mockReturnValue(of({ data: {} } as any))

        const result = await microsoftLogin.verify('test@example.com')
        expect(result).toBe(false)
    })
})
