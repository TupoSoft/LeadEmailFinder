import { Test, TestingModule } from '@nestjs/testing'
import { HttpService } from '@nestjs/axios'
import { of, Subject, throwError } from 'rxjs'
import { Logger } from '@nestjs/common'
import { OfficeApps } from './office-apps.service'

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

    it.each(['OrgId,Placeholder', 'Neither', 'Error', 'Throttled'])(
        'should return false for the invalid response %s',
        async response => {
            httpService.get.mockReturnValueOnce(of({ data: response } as any))

            await expect(officeApps.verify('test@example.com')).resolves.toBe(false)
            expect(httpService.get).toHaveBeenCalledTimes(1)
        },
    )

    it.each([null, undefined, {}])(
        'should preserve the existing positive interpretation of unexpected data %j',
        async data => {
            httpService.get.mockReturnValueOnce(of({ data } as any))

            await expect(officeApps.verify('test@example.com')).resolves.toBe(true)
            expect(httpService.get).toHaveBeenCalledTimes(1)
        },
    )

    it('should retain its source and send one request with the existing address URL', async () => {
        httpService.get.mockReturnValueOnce(of({ data: 'ValidResponse' } as any))

        await officeApps.verify('test+fixture@example.com')

        expect(officeApps.sourceName).toBe('microsoft_2')
        expect(httpService.get).toHaveBeenCalledTimes(1)
        expect(httpService.get).toHaveBeenCalledWith(
            'https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=0&emailAddress=test+fixture@example.com',
        )
    })

    it('should isolate address URLs while verification calls overlap', async () => {
        const firstResponse = new Subject<any>()
        const secondResponse = new Subject<any>()
        httpService.get.mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse)

        const firstResult = officeApps.verify('first@example.com')
        const secondResult = officeApps.verify('second@example.com')

        expect(httpService.get).toHaveBeenCalledTimes(2)
        expect(httpService.get).toHaveBeenNthCalledWith(
            1,
            'https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=0&emailAddress=first@example.com',
        )
        expect(httpService.get).toHaveBeenNthCalledWith(
            2,
            'https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=0&emailAddress=second@example.com',
        )

        secondResponse.next({ data: 'Neither' })
        secondResponse.complete()
        firstResponse.next({ data: 'ValidResponse' })
        firstResponse.complete()

        await expect(Promise.all([firstResult, secondResult])).resolves.toEqual([true, false])
    })

    it('should return false when the HTTP observable has no response', async () => {
        const mockEmail = 'test@example.com'

        httpService.get.mockReturnValue(of())

        const result = await officeApps.verify(mockEmail)

        expect(result).toBe(false)
    })

    it('should return false for an error response', async () => {
        const mockEmail = 'office-apps-sentinel@example.test'
        const encodedEmail = encodeURIComponent(mockEmail)
        const errorMessage = `Network error echoed ${mockEmail} and ${encodedEmail}`
        const remoteBody = 'provider response body sentinel'
        const credential = 'provider credential sentinel'
        const error = Object.assign(new Error(errorMessage), { response: { data: remoteBody }, credential })

        httpService.get.mockReturnValue(throwError(() => error))

        const result = await officeApps.verify(mockEmail)

        expect(result).toBe(false)
        expect(logger.debug).toHaveBeenCalledWith({
            event: 'account_discovery_verification',
            provider: 'office_apps',
            outcome: 'failed',
        })
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(mockEmail)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(encodedEmail)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(errorMessage)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(remoteBody)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(credential)
    })
})
