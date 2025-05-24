import { ICatchAllVerifier } from '../../../../common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { Injectable } from '@nestjs/common'
import { MicrosoftLoginErrorCode } from './microsoft-login-error-code.enum'
import { isMicrosoftError } from './microsoft-error.type-guard'

@Injectable()
export class MicrosoftLogin implements ICatchAllVerifier {
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

    sourceName = 'microsoft_1' as const

    constructor(private readonly httpService: HttpService) {}

    verify: (email: string) => Promise<boolean> = async email => {
        const { URL: url, HEADERS: headers, BODY: body } = MicrosoftLogin
        body.username = email

        try {
            await firstValueFrom(
                this.httpService.post(url, body, {
                    headers,
                }),
            )
        } catch (error: unknown) {
            if (!isMicrosoftError(error)) return false

            const {
                response: {
                    data: { error_codes: errorCodes },
                },
            } = error

            if (errorCodes.some(value => MicrosoftLogin.USER_EXISTS_ERROR_CODES.has(value))) {
                return true
            }
        }

        return false
    }
}
