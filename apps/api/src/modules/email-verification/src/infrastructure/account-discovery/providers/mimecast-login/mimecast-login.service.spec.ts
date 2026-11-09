import { MimecastLogin, MimecastRegion } from './mimecast-login.service'
import { HttpService } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { of, Subject, throwError } from 'rxjs'
import { Logger } from '@nestjs/common'

describe('MimecastLogin', () => {
    let mimecastLogin: MimecastLogin
    let httpService: jest.Mocked<HttpService>
    let logger: jest.Mocked<Logger>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MimecastLogin,
                {
                    provide: HttpService,
                    useValue: {
                        post: jest.fn(),
                    },
                },
                {
                    provide: Logger,
                    useValue: {
                        debug: jest.fn(),
                    },
                },
            ],
        }).compile()

        mimecastLogin = module.get<MimecastLogin>(MimecastLogin)
        httpService = module.get(HttpService)
        logger = module.get(Logger)
    })

    it.each([
        ['us', 'https://login-us.mimecast.com/u/proxy/api/login/discover-authentication'],
        ['uk', 'https://login-uk.mimecast.com/u/proxy/api/login/discover-authentication'],
    ] satisfies Array<[MimecastRegion, string]>)(
        'should send one request to the selected %s region',
        async (region, url) => {
            const email = 'test@example.com'
            const validResponse = {
                data: [
                    {
                        authenticate: ['Basic-Ad'],
                    },
                ],
            }

            httpService.post.mockReturnValueOnce(of({ data: validResponse } as any))

            const provider = mimecastLogin.forRegion(region)
            const result = await provider.verify(email)

            expect(provider.sourceName).toBe('mimecast')
            expect(result).toBe(true)
            expect(httpService.post).toHaveBeenCalledTimes(1)
            expect(httpService.post).toHaveBeenCalledWith(
                url,
                {
                    data: [{ emailAddress: email }],
                },
                {
                    headers: {
                        'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="100", "Google Chrome";v="100"',
                        'x-mc-api-version': '2017.2.22',
                        'x-mc-req-id': '647cb0d6-603a-542b-68a4-7ffc41a67bce',
                        'sec-ch-ua-mobile': '?1',
                        'User-Agent':
                            'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36',
                        'Content-Type': 'application/json;charset=UTF-8',
                        Referer: 'https://login.mimecast.com/u/login/?gta=apps',
                        'x-mc-strict': 'nopendo',
                        'x-mc-app-id': '4941cc2e-85e5-4988-af50-688b03a29f96',
                        'sec-ch-ua-platform': '"Android"',
                    },
                },
            )
        },
    )

    it('should reject an unsupported region before making a request', () => {
        expect(() => mimecastLogin.forRegion('eu' as MimecastRegion)).toThrow('Unsupported Mimecast region: eu')
        expect(httpService.post).not.toHaveBeenCalled()
    })

    it.each(['Basic-Ad', 'Basic-Cloud'])('should accept the %s authentication type', async authenticationType => {
        httpService.post.mockReturnValueOnce(of({ data: { data: [{ authenticate: [authenticationType] }] } } as any))

        await expect(mimecastLogin.forRegion('us').verify('test@example.com')).resolves.toBe(true)
        expect(httpService.post).toHaveBeenCalledTimes(1)
    })

    it.each([null, {}, { data: [] }, { data: [{ authenticate: null }] }])(
        'should return false for malformed response data %j',
        async data => {
            httpService.post.mockReturnValueOnce(of({ data } as any))

            await expect(mimecastLogin.forRegion('uk').verify('test@example.com')).resolves.toBe(false)
            expect(httpService.post).toHaveBeenCalledTimes(1)
        },
    )

    it('should isolate addresses and regions while verification calls overlap', async () => {
        const firstResponse = new Subject<any>()
        const secondResponse = new Subject<any>()
        httpService.post.mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse)

        const firstResult = mimecastLogin.forRegion('us').verify('first@example.com')
        const secondResult = mimecastLogin.forRegion('uk').verify('second@example.com')

        expect(httpService.post).toHaveBeenCalledTimes(2)
        const [firstUrl, firstBody] = httpService.post.mock.calls[0]
        const [secondUrl, secondBody] = httpService.post.mock.calls[1]
        expect(firstUrl).toBe('https://login-us.mimecast.com/u/proxy/api/login/discover-authentication')
        expect(secondUrl).toBe('https://login-uk.mimecast.com/u/proxy/api/login/discover-authentication')
        expect(firstBody).toEqual({ data: [{ emailAddress: 'first@example.com' }] })
        expect(secondBody).toEqual({ data: [{ emailAddress: 'second@example.com' }] })
        expect(firstBody).not.toBe(secondBody)

        secondResponse.next({ data: { data: [{ authenticate: ['SAML'] }] } })
        secondResponse.complete()
        firstResponse.next({ data: { data: [{ authenticate: ['Basic-Ad'] }] } })
        firstResponse.complete()

        await expect(Promise.all([firstResult, secondResult])).resolves.toEqual([true, false])
    })

    it('should return false if no valid authentication type is found', async () => {
        const invalidResponse = {
            data: [
                {
                    authenticate: ['Invalid-Type'],
                },
            ],
        }

        httpService.post.mockReturnValueOnce(of({ data: invalidResponse } as any))

        const result = await mimecastLogin.forRegion('us').verify('test@example.com')

        expect(result).toBe(false)
        expect(httpService.post).toHaveBeenCalledTimes(1)
    })

    it('should return false if the selected regional request fails', async () => {
        const email = 'mimecast-sentinel@example.test'
        const encodedEmail = encodeURIComponent(email)
        const errorMessage = `Request failed for ${email} (${encodedEmail})`
        const remoteBody = 'provider response body sentinel'
        const credential = 'provider credential sentinel'
        const error = Object.assign(new Error(errorMessage), { response: { data: remoteBody }, credential })

        httpService.post.mockReturnValueOnce(throwError(() => error))

        const result = await mimecastLogin.forRegion('uk').verify(email)

        expect(result).toBe(false)
        expect(httpService.post).toHaveBeenCalledTimes(1)
        expect(logger.debug).toHaveBeenCalledWith({
            event: 'account_discovery_verification',
            provider: 'mimecast',
            outcome: 'failed',
        })
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(email)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(encodedEmail)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(errorMessage)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(remoteBody)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(credential)
    })
})
