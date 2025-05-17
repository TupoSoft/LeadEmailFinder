import { Test, TestingModule } from '@nestjs/testing'
import { MicrosoftLogin } from './microsoft-login'
import { HttpService } from '@nestjs/axios'
import { of, throwError } from 'rxjs'

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

    it('should return true if user exists based on error codes', async () => {
        const responseError = {
            response: {
                data: {
                    error_codes: [MicrosoftLogin['USER_EXISTS_ERROR_CODES'].values().next().value],
                },
            },
        }

        httpService.post.mockReturnValue(throwError(responseError))

        const result = await microsoftLogin.verify('test@example.com')
        expect(result).toBe(true)
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

    it('should return false if HTTP request succeeds', async () => {
        httpService.post.mockReturnValue(of({ data: {} } as any))

        const result = await microsoftLogin.verify('test@example.com')
        expect(result).toBe(false)
    })
})
