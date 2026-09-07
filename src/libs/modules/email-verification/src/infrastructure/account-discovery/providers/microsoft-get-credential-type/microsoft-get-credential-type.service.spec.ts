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

    it.each([0, 5, 6])('should return true for IfExistsResult %s', async ifExistsResult => {
        const email = 'test@example.com'

        httpService.post.mockReturnValueOnce(of({ data: { IfExistsResult: ifExistsResult } } as any))

        const result = await service.verify(email)
        expect(result).toBe(true)
    })

    it.each([{}, null, { IfExistsResult: '0' }])('should return false for malformed response data %j', async data => {
        httpService.post.mockReturnValueOnce(of({ data } as any))

        await expect(service.verify('test@example.com')).resolves.toBe(false)
        expect(httpService.post).toHaveBeenCalledTimes(1)
    })

    it('should retain its source and send one request with the existing payload and options', async () => {
        httpService.post.mockReturnValueOnce(of({ data: { IfExistsResult: 0 } } as any))

        await service.verify('test+fixture@example.com')

        expect(service.sourceName).toBe('microsoft_4')
        expect(httpService.post).toHaveBeenCalledTimes(1)
        expect(httpService.post).toHaveBeenCalledWith(
            'https://login.microsoftonline.com/common/GetCredentialType',
            {
                isOtherIdpSupported: true,
                checkPhones: true,
                isRemoteNGCSupported: true,
                isCookieBannerShown: false,
                isFidoSupported: false,
                country: 'UA',
                forceotclogin: false,
                isExternalFederationDisallowed: false,
                isRemoteConnectSupported: false,
                federationFlags: 0,
                isSignup: false,
                isAccessPassSupported: true,
                username: 'test+fixture@example.com',
            },
            {
                params: { mkt: 'en-GB' },
                headers: {
                    Accept: 'application/json',
                    'Accept-Language': 'en-GB,en;q=0.9,ru-RU;q=0.8,ru;q=0.7,en-US;q=0.6,de;q=0.5',
                    Connection: 'keep-alive',
                    'Content-type': 'application/json; charset=UTF-8',
                    Origin: 'https://login.microsoftonline.com',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'User-Agent':
                        'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36',
                    hpgact: '1800',
                    hpgid: '1104',
                    'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="100", "Google Chrome";v="100"',
                    'sec-ch-ua-mobile': '?1',
                    'sec-ch-ua-platform': '"Android"',
                },
            },
        )
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

        expect(httpService.post).toHaveBeenCalledTimes(2)
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
        const remoteBody = 'provider response body sentinel'
        const credential = 'provider credential sentinel'
        const error = Object.assign(new Error(errorMessage), { response: { data: remoteBody }, credential })

        httpService.post.mockImplementation(() => throwError(() => error))

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
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(remoteBody)
        expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(credential)
    })
})
