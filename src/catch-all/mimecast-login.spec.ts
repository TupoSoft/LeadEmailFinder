import { MimecastLogin } from './mimecast-login'
import { HttpService } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { of, throwError } from 'rxjs'
import { Logger } from '@nestjs/common'

describe('MimecastLogin', () => {
    let mimecastLogin: MimecastLogin
    let httpService: jest.Mocked<HttpService>
    let logger: jest.Mocked<Logger>

    beforeAll(async () => {
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

    it('should return true if a valid authentication type is found', async () => {
        const email = 'test@example.com'
        const validResponse = {
            data: [
                {
                    authenticate: ['Basic-Ad'],
                },
            ],
        }

        httpService.post
            .mockReturnValueOnce(of({ data: validResponse } as any))
            .mockReturnValueOnce(of({ data: validResponse } as any))

        const result = await mimecastLogin.verify(email)

        expect(result).toBe(true)
    })

    it('should return false if no valid authentication type is found', async () => {
        const email = 'test@example.com'
        const invalidResponse = {
            data: [
                {
                    authenticate: ['Invalid-Type'],
                },
            ],
        }

        httpService.post
            .mockReturnValueOnce(of({ data: invalidResponse } as any))
            .mockReturnValueOnce(of({ data: invalidResponse } as any))

        const result = await mimecastLogin.verify(email)

        expect(result).toBe(false)
    })

    it('should return false if all requests fail', async () => {
        const email = 'test@example.com'

        httpService.post.mockReturnValue(throwError(() => new Error('Request failed')))

        const result = await mimecastLogin.verify(email)

        expect(result).toBe(false)
        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining(`Mimecast catch all verification ended in error for email ${email}`),
        )
    })

    it('should handle mixed responses and return true if at least one valid authentication type is found', async () => {
        const email = 'test@example.com'

        const validResponse = {
            data: [
                {
                    authenticate: ['Basic-Ad'],
                },
            ],
        }

        const invalidResponse = {
            data: [
                {
                    authenticate: ['Invalid-Type'],
                },
            ],
        }

        httpService.post
            .mockReturnValueOnce(of({ data: invalidResponse } as any))
            .mockReturnValueOnce(of({ data: validResponse } as any))

        const result = await mimecastLogin.verify(email)

        expect(result).toBe(true)
    })
})
