import { Test, TestingModule } from '@nestjs/testing'
import { MicrosoftLogin } from './microsoft-login.service'
import { HttpService } from '@nestjs/axios'
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

    it('should keep request bodies isolated while verification calls overlap', async () => {
        const firstResponse = new Subject<any>()
        const secondResponse = new Subject<any>()

        httpService.post.mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse)

        const firstResult = microsoftLogin.verify('first@example.com')
        const secondResult = microsoftLogin.verify('second@example.com')

        const firstBody = httpService.post.mock.calls[0][1]
        const secondBody = httpService.post.mock.calls[1][1]

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
