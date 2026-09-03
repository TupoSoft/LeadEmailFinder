import { MimecastLogin, MimecastRegion } from './mimecast-login.service'
import { HttpService } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { of, throwError } from 'rxjs'
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

            const result = await mimecastLogin.forRegion(region).verify(email)

            expect(result).toBe(true)
            expect(httpService.post).toHaveBeenCalledTimes(1)
            expect(httpService.post).toHaveBeenCalledWith(
                url,
                {
                    data: [{ emailAddress: email }],
                },
                expect.objectContaining({ headers: expect.any(Object) }),
            )
        },
    )

    it('should reject an unsupported region before making a request', () => {
        expect(() => mimecastLogin.forRegion('eu' as MimecastRegion)).toThrow('Unsupported Mimecast region: eu')
        expect(httpService.post).not.toHaveBeenCalled()
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

        httpService.post.mockReturnValueOnce(throwError(() => new Error(errorMessage)))

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
    })
})
