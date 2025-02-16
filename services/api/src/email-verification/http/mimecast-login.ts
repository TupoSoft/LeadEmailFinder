import type { CatchAllEmailVerifier } from './catch-all-email-verifier'
import type { AxiosRequestConfig } from 'axios'
import type { HttpClient } from '../../http-client'
import type { EmailVerificationSource } from '../dto'

export type Authenticate = 'Basic-Cloud' | 'Basic-Ad' | 'SAML' | 'JWT'

export interface MimecastResponse {
    data: Array<{
        emailAddress: string
        emailToken: string
        authenticate: Authenticate[]
    }>
}

export interface MimecastData {
    data: [
        {
            emailAddress: string
        },
    ]
}

export class MimecastLogin implements CatchAllEmailVerifier {
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

    sourceName: EmailVerificationSource = 'mimecast'

    constructor(private readonly httpClient: HttpClient) {}

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
                data: [{ authenticate: authTypes }],
            } = await this.httpClient.post<MimecastResponse>(url.replace('{countryCode}', countryCode), body, config)

            for (const authType of authTypes) {
                if (expectedAuthTypes.includes(authType)) {
                    return true
                }
            }

            throw new Error('Mimecast login failed')
        })

        try {
            return await Promise.any(promises)
        } catch (error) {}

        return false
    }
}
