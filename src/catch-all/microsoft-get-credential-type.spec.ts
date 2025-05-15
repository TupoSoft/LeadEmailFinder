import { MicrosoftGetCredentialType } from './microsoft-get-credential-type'
import { HttpService } from '@nestjs/axios'
import { Logger } from '@nestjs/common'
import { of, throwError } from 'rxjs'
import { Test } from '@nestjs/testing'

describe('MicrosoftGetCredentialType', () => {
    let service: MicrosoftGetCredentialType
    let httpService: jest.Mocked<HttpService>
    let logger: jest.Mocked<Logger>

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                MicrosoftGetCredentialType,
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

        httpService = moduleRef.get(HttpService)
        service = moduleRef.get(MicrosoftGetCredentialType)
        logger = moduleRef.get(Logger)
    })

    it('should return true when IfExistsResult is in the valid results array', async () => {
        const email = 'test@example.com'

        httpService.post.mockReturnValueOnce(of({ data: { IfExistsResult: 0 } } as any))

        const result = await service.verify(email)
        expect(result).toBe(true)
    })

    it('should return false when IfExistsResult is not in the valid results array', async () => {
        const email = 'test@example.com'

        httpService.post.mockReturnValueOnce(of({ data: { IfExistsResult: 10 } } as any))

        const result = await service.verify(email)
        expect(result).toBe(false)
    })

    it('should log an error and return false when the HTTP request fails', async () => {
        const email = 'test@example.com'
        const errorMessage = 'HTTP error'

        httpService.post.mockImplementation(() => throwError(() => new Error(errorMessage)))

        const result = await service.verify(email)
        expect(result).toBe(false)
        expect(logger.debug).toHaveBeenCalledWith(
            `microsoft_4 catch all verification ended in error for email ${email}: ${errorMessage}`,
        )
    })
})
