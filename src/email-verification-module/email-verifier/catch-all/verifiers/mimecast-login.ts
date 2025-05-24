import type { AxiosRequestConfig } from 'axios'
import { ICatchAllVerifier } from '../../../../common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { MimecastData, MimecastResponse } from '../interfaces'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { isNativeError } from 'node:util/types'

@Injectable()
export class MimecastLogin implements ICatchAllVerifier {
    private static readonly URL = 'https://login-{countryCode}.mimecast.com/u/proxy/api/login/discover-authentication'

    private static readonly HEADERS = {
        'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="100", "Google Chrome";v="100"',
        'x-mc-api-version': '2017.2.22',
        'x-mc-req-id': '647cb0d6-603a-542b-68a4-7ffc41a67bce',
        'sec-ch-ua-mobile': '?1',
        'User-Agent':
            'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36',
        'Content-Type': 'application/json;charset=UTF-8',
        Referer: 'https://login.mimecast.com/u/login/?gta=apps',
        'x-mc-strict': 'nopendo',
        'x-mc-app-id': '4941cc2e-85e5-4988-af50-688b03a29f96',
        'sec-ch-ua-platform': '"Android"',
    }

    private static readonly EXPECTED_AUTH_TYPES = ['Basic-Ad', 'Basic-Cloud']

    sourceName = 'mimecast' as const

    constructor(
        @Optional()
        private readonly logger: Logger = new Logger(MimecastLogin.name),
        private readonly httpService: HttpService,
    ) {}

    verify: (email: string) => Promise<boolean> = async email => {
        const { URL: url, HEADERS: headers, EXPECTED_AUTH_TYPES: expectedAuthTypes } = MimecastLogin

        const countryCodes = ['us', 'uk']

        const body: MimecastData = {
            data: [
                {
                    emailAddress: email,
                },
            ],
        }

        const config: AxiosRequestConfig<MimecastData> = {
            headers,
        }

        const promises = countryCodes.map(async countryCode => {
            const {
                data: {
                    data: [{ authenticate: authTypes }],
                },
            } = await firstValueFrom(
                this.httpService.post<MimecastResponse>(url.replace('{countryCode}', countryCode), body, config),
            )

            for (const authType of authTypes) {
                if (expectedAuthTypes.includes(authType)) {
                    return true
                }
            }

            throw new Error('Mimecast login failed')
        })

        try {
            return await Promise.any(promises)
        } catch (error) {
            if (isNativeError(error)) {
                this.logger.debug(`Mimecast catch all verification ended in error for email ${email}: ${error.message}`)
            }

            return false
        }
    }
}
