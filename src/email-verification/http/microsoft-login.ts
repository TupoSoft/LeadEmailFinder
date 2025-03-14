import type { CatchAllEmailVerifier } from './catch-all-email-verifier'
import type { HttpClient } from '../../http-client'
import type { EmailVerificationSource } from '../dto'
import { isMicrosoftError } from './type-guards'

export enum MicrosoftLoginErrorCode {
    InvalidGrant = 50126,
    MustEnrollMfa = 50079,
    MustUseMfa = 50076,
    SecurityChallengeNotSatisfied = 50158,
}

export interface MicrosoftErrorData {
    error_codes: MicrosoftLoginErrorCode[]
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

    private static readonly USER_EXISTS_ERROR_CODES = new Set([
        MicrosoftLoginErrorCode.InvalidGrant,
        MicrosoftLoginErrorCode.MustEnrollMfa,
        MicrosoftLoginErrorCode.MustUseMfa,
        MicrosoftLoginErrorCode.SecurityChallengeNotSatisfied,
    ])

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
            if (!isMicrosoftError(error)) return false
            const { response } = error

            if (response === undefined) return false

            const {
                data: { error_codes: errorCodes },
            } = response

            if (errorCodes.some(value => MicrosoftLogin.USER_EXISTS_ERROR_CODES.has(value))) {
                return true
            }
        }

        return false
    }
}
