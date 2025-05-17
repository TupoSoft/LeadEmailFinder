import { Test, TestingModule } from '@nestjs/testing'
import { HttpService } from '@nestjs/axios'
import { of, throwError } from 'rxjs'
import { Logger } from '@nestjs/common'
import { OfficeApps } from './office-apps'

describe('OfficeApps', () => {
    let officeApps: OfficeApps
    let httpService: jest.Mocked<HttpService>
    let logger: jest.Mocked<Logger>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OfficeApps,
                {
                    provide: HttpService,
                    useValue: {
                        get: jest.fn(),
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

        officeApps = module.get(OfficeApps)
        httpService = module.get(HttpService)
        logger = module.get(Logger)
    })

    it('should return true for a valid response', async () => {
        const mockEmail = 'test@example.com'

        httpService.get.mockReturnValue(of({ data: 'ValidResponse' } as any))

        const result = await officeApps.verify(mockEmail)

        expect(result).toBe(true)
    })

    it('should return false for an invalid response', async () => {
        const mockEmail = 'test@example.com'

        httpService.get.mockReturnValue(of({ data: 'OrgId,Placeholder' } as any))

        const result = await officeApps.verify(mockEmail)

        expect(result).toBe(false)
    })

    it('should return false for an error response', async () => {
        const mockEmail = 'test@example.com'
        const error = new Error('Network Error')

        httpService.get.mockReturnValue(throwError(() => error))

        const result = await officeApps.verify(mockEmail)

        expect(result).toBe(false)
        expect(logger.debug).toHaveBeenCalledWith(
            `OfficeApps catch all verification ended in error for email ${mockEmail}: ${error.message}`,
        )
    })
})
