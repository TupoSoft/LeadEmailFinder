import type { CatchAllEmailVerifier } from './catch-all-email-verifier'
import type { HttpClient } from '../../http-client'
import type { EmailVerificationSource } from '../dto'

const enum IfExistsResult {
    AccountExists = 0,
    DifferentIdentityProvider = 5,
    DomainAndDifferentIdentityProvider = 6,
}

interface MicrosoftGetCredsResponseData {
    IfExistsResult: IfExistsResult
}

const federationFlags = 0

export class MicrosoftGetCredentialType implements CatchAllEmailVerifier {
    private static readonly URL = 'https://login.microsoftonline.com/common/GetCredentialType'

    private static readonly HEADERS = {
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
    }

    private static readonly DATA = {
        username: '<EMAIL>',
        isOtherIdpSupported: true,
        checkPhones: true,
        isRemoteNGCSupported: true,
        isCookieBannerShown: false,
        isFidoSupported: false,
        country: 'UA',
        forceotclogin: false,
        isExternalFederationDisallowed: false,
        isRemoteConnectSupported: false,
        federationFlags,
        isSignup: false,
        isAccessPassSupported: true,
    }

    private static readonly PARAMS = {
        mkt: 'en-GB',
    }

    private static readonly EXISTS_RESULT = [
        IfExistsResult.AccountExists,
        IfExistsResult.DifferentIdentityProvider,
        IfExistsResult.DomainAndDifferentIdentityProvider,
    ]

    sourceName: EmailVerificationSource = 'microsoft_4'

    constructor(private readonly httpClient: HttpClient) {}

    verify: (email: string) => Promise<boolean> = async email => {
        const {
            URL: url,
            DATA: data,
            PARAMS: params,
            HEADERS: headers,
            EXISTS_RESULT: existsResult,
        } = MicrosoftGetCredentialType

        data.username = email

        try {
            const { IfExistsResult } = await this.httpClient.post<MicrosoftGetCredsResponseData>(url, data, {
                params,
                headers,
            })

            if (existsResult.includes(IfExistsResult)) {
                return true
            }
        } catch (error: unknown) {}

        return false
    }
}
