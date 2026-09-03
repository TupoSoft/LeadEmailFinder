import { MicrosoftGetCredentialType } from './microsoft-get-credential-type.service'
import { HttpService } from '@nestjs/axios'
import { Logger } from '@nestjs/common'
import { of, Subject, throwError } from 'rxjs'
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

    it('should keep request bodies isolated while verification calls overlap', async () => {
        const firstResponse = new Subject<any>()
        const secondResponse = new Subject<any>()

        httpService.post.mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse)

        const firstResult = service.verify('first@example.com')
        const secondResult = service.verify('second@example.com')

        const firstBody = httpService.post.mock.calls[0][1]
        const secondBody = httpService.post.mock.calls[1][1]

        expect(firstBody).toEqual(expect.objectContaining({ username: 'first@example.com' }))
        expect(secondBody).toEqual(expect.objectContaining({ username: 'second@example.com' }))
        expect(firstBody).not.toBe(secondBody)

        secondResponse.next({ data: { IfExistsResult: 0 } })
        secondResponse.complete()
        firstResponse.next({ data: { IfExistsResult: 0 } })
        firstResponse.complete()

        await expect(Promise.all([firstResult, secondResult])).resolves.toEqual([true, true])
    })

    it('should log an error and return false when the HTTP request fails', async () => {
        const email = 'microsoft-get-credential-type-sentinel@example.test'
        const encodedEmail = encodeURIComponent(email)
        const errorMessage = `HTTP error echoed ${email} and ${encodedEmail}`

        httpService.post.mockImplementation(() => throwError(() => new Error(errorMessage)))

        const result = await service.verify(email)
        expect(result).toBe(false)
        expect(logger.debug).toHaveBeenCalledWith({
            event: 'account_discovery_verification',
            provider: 'microsoft_get_credential_type',
            outcome: 'failed',
        })
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(email)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(encodedEmail)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(errorMessage)
    })
})
