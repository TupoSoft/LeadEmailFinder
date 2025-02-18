import type { CatchAllEmailVerifier } from './catch-all-email-verifier'
import type { HttpClient } from '../../http-client'
import { AxiosError } from 'axios'
import type { EmailVerificationSource } from '../dto'

export interface MicrosoftError {
    error: string
    error_description: string
    error_codes: number[]
    timestamp: Date
    trace_id: string
    correlation_id: string
    error_uri: string
}

export class MicrosoftLogin implements CatchAllEmailVerifier {
    private static readonly URL = 'https://login.microsoft.com/common/oauth2/token'

    private static readonly HEADERS = {
        'User-Agent': 'Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.12026; Pro',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
    }

    private static readonly BODY = {
        resource: 'https://graph.windows.net',
        client_id: '1b730954-1685-4b74-9bfd-dac224a7b894',
        client_info: '1',
        grant_type: 'password',
        username: '<EMAIL>',
        password: 'Password1',
        scope: 'openid',
    }

    sourceName: EmailVerificationSource = 'microsoft_1'

    constructor(private readonly httpClient: HttpClient) {}

    verify: (email: string) => Promise<boolean> = async email => {
        const { URL: url, HEADERS: headers, BODY: body } = MicrosoftLogin
        body.username = email

        try {
            await this.httpClient.post(url, body, {
                headers,
            })
        } catch (error: unknown) {
            if (error instanceof AxiosError) {
                const { response } = error as AxiosError<MicrosoftError, unknown>
                if (response !== undefined) {
                    const acceptableErrorCodes = new Set<number>([50126, 50079, 50076, 50158])

                    const {
                        data: { error_codes: errorCodes },
                    } = response

                    if (errorCodes.some(value => acceptableErrorCodes.has(value))) {
                        return true
                    }
                }
            }
        }

        return false
    }
}
