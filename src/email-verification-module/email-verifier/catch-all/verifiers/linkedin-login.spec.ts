import { LinkedInLogin } from './linkedin-login'
import { HttpService } from '@nestjs/axios'
import { of, throwError } from 'rxjs'
import { AxiosError } from 'axios'
import { Test, TestingModule } from '@nestjs/testing'

describe('LinkedInLogin', () => {
    let linkedInLogin: LinkedInLogin
    let httpService: HttpService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LinkedInLogin,
                {
                    provide: HttpService,
                    useValue: {
                        post: jest.fn(),
                    },
                },
            ],
        }).compile()

        linkedInLogin = module.get<LinkedInLogin>(LinkedInLogin)
        httpService = module.get<HttpService>(HttpService)
    })

    it('should return true on HTTP 400 response for invalid LinkedIn email', async () => {
        const email = 'invalid@example.com'
        const axiosError = new AxiosError('Bad Request', 'ERR_BAD_REQUEST', undefined, undefined, {
            status: 400,
            config: {},
            headers: {},
            data: {},
        } as any)

        jest.spyOn(httpService, 'post').mockReturnValueOnce(throwError(() => axiosError))

        const result = await linkedInLogin.verify(email)

        expect(result).toBe(true)
        expect(httpService.post).toHaveBeenCalledWith(
            expect.stringContaining('https://www.linkedin.com/checkpoint/rp/request-password-reset-submit'),
            expect.objectContaining({ userName: email }),
            expect.objectContaining({ headers: LinkedInLogin['HEADERS'] }),
        )
    })

    it('should return false when no error occurs for email verification', async () => {
        const email = 'valid@example.com'
        jest.spyOn(httpService, 'post').mockReturnValueOnce(of({ data: {} } as any))

        const result = await linkedInLogin.verify(email)

        expect(result).toBe(false)
        expect(httpService.post).toHaveBeenCalledWith(
            expect.stringContaining('https://www.linkedin.com/checkpoint/rp/request-password-reset-submit'),
            expect.objectContaining({ userName: email }),
            expect.objectContaining({ headers: LinkedInLogin['HEADERS'] }),
        )
    })
})
