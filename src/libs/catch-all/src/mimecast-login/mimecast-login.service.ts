import type { AxiosRequestConfig } from 'axios'
import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { isNativeError } from 'node:util/types'
import { MimecastData } from './mimecast-data.interface'
import { MimecastResponse } from './mimecast-response.interface'

export type MimecastRegion = 'us' | 'uk'

@Injectable()
export class MimecastLogin {
    private static readonly URLS: Readonly<Record<MimecastRegion, string>> = Object.freeze({
        us: 'https://login-us.mimecast.com/u/proxy/api/login/discover-authentication',
        uk: 'https://login-uk.mimecast.com/u/proxy/api/login/discover-authentication',
    })

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

    readonly sourceName = 'mimecast' as const

    constructor(
        @Optional()
        private readonly logger: Logger = new Logger(MimecastLogin.name),
        private readonly httpService: HttpService,
    ) {}

    forRegion(region: MimecastRegion): ICatchAllVerifier {
        const url = MimecastLogin.urlForRegion(region)

        return Object.freeze({
            sourceName: this.sourceName,
            verify: (email: string) => this.verifyAtUrl(email, url),
        })
    }

    private static urlForRegion(region: MimecastRegion): string {
        switch (region) {
            case 'us':
                return MimecastLogin.URLS.us
            case 'uk':
                return MimecastLogin.URLS.uk
            default:
                throw new Error(`Unsupported Mimecast region: ${String(region)}`)
        }
    }

    private async verifyAtUrl(email: string, url: string): Promise<boolean> {
        const { HEADERS: headers, EXPECTED_AUTH_TYPES: expectedAuthTypes } = MimecastLogin

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

        try {
            const {
                data: {
                    data: [{ authenticate: authTypes }],
                },
            } = await firstValueFrom(this.httpService.post<MimecastResponse>(url, body, config))

            for (const authType of authTypes) {
                if (expectedAuthTypes.includes(authType)) {
                    return true
                }
            }

            throw new Error('Mimecast login failed')
        } catch (error) {
            if (isNativeError(error)) {
                this.logger.debug({
                    event: 'account_discovery_verification',
                    provider: 'mimecast',
                    outcome: 'failed',
                })
            }

            return false
        }
    }
}
