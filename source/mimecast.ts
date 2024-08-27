import axios, { type AxiosResponse } from 'axios'

type Authenticate = 'Basic-Cloud' | 'Basic-Ad' | 'SAML' | 'JWT'

interface MimecastResponse {
    data: Array<{
        emailAddress: string
        emailToken: string
        authenticate: Authenticate[]
    }>
}

interface MimecastData {
    data: [
        {
            emailAddress: string
        }
    ]
}

export const enum MimecastLoginResult {
    Valid,
    Invalid,
    Unknown,
    Error,
}

export async function mimecastLogin(username: string): Promise<MimecastLoginResult> {
    const headers = {
        'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="100", "Google Chrome";v="100"',
        'x-mc-api-version': '2017.2.22',
        'x-mc-req-id': '647cb0d6-603a-542b-68a4-7ffc41a67bce',
        'sec-ch-ua-mobile': '?1',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36',
        'Content-Type': 'application/json;charset=UTF-8',
        Referer: 'https://login.mimecast.com/u/login/?gta=apps',
        'x-mc-strict': 'nopendo',
        'x-mc-app-id': '4941cc2e-85e5-4988-af50-688b03a29f96',
        'sec-ch-ua-platform': '"Android"',
    }

    try {
        const { data } = await axios.post<MimecastResponse, AxiosResponse<MimecastResponse>, MimecastData>('https://login-us.mimecast.com/u/proxy/api/login/discover-authentication', {
            data: [
                {
                    emailAddress: username,
                },
            ],
        }, {
            headers,
        })

        const { authenticate } = data.data[0]

        if (authenticate.length > 0) {
            switch (authenticate[0]) {
                case 'Basic-Ad':
                case 'Basic-Cloud':
                    return MimecastLoginResult.Unknown
                case 'SAML':
                case 'JWT':
                    return MimecastLoginResult.Valid
                default:
                    return MimecastLoginResult.Invalid
            }
        }
    } catch (error: unknown) {
        return MimecastLoginResult.Error
    }

    return MimecastLoginResult.Error
}
