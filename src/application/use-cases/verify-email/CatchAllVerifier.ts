import type { HttpClient } from '../../interfaces/HttpClient'
import { AxiosError, type AxiosRequestConfig } from 'axios'

export interface MicrosoftGetCredsResponseData {
    IfExistsResult: number
}

export interface MicrosoftError {
    error: string
    error_description: string
    error_codes: number[]
    timestamp: Date
    trace_id: string
    correlation_id: string
    error_uri: string
}

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

export type CatchAllVerificationSource =
    | 'MicrosoftGetCredentialType'
    | 'MicrosoftLogin'
    | 'MimecastLogin'
    | 'OfficeApps'
    | 'LinkedInLogin'
    | 'None'

export interface CatchAllVerificationResult {
    source: CatchAllVerificationSource
    success: boolean
}

export class CatchAllVerificationError extends Error {
    constructor(readonly result: CatchAllVerificationResult) {
        super(`${result.source} verification failed`)
    }
}

export class CatchAllVerifier {
    constructor(private readonly httpClient: HttpClient) {}

    async microsoftGetCreds(email: string): Promise<CatchAllVerificationResult> {
        const result: CatchAllVerificationResult = {
            success: false,
            source: 'MicrosoftGetCredentialType',
        }

        const headers = {
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

        const params = {
            mkt: 'en-GB',
        }

        const jsonData = {
            username: email,
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
        }

        try {
            const { IfExistsResult } = await this.httpClient.post<MicrosoftGetCredsResponseData, typeof jsonData>(
                'https://login.microsoftonline.com/common/GetCredentialType',
                jsonData,
                {
                    params,
                    headers,
                },
            )

            if ([0, 5, 6].includes(IfExistsResult)) {
                result.success = true
                return result
            }
        } catch (error: unknown) {}

        throw new CatchAllVerificationError(result)
    }

    async microsoftLogin(email: string): Promise<CatchAllVerificationResult> {
        const result: CatchAllVerificationResult = {
            success: false,
            source: 'MicrosoftLogin',
        }

        const headers = {
            'User-Agent': 'Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.12026; Pro',
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        }

        const body = {
            resource: 'https://graph.windows.net',
            client_id: '1b730954-1685-4b74-9bfd-dac224a7b894',
            client_info: '1',
            grant_type: 'password',
            username: email,
            password: 'Password1',
            scope: 'openid',
        }

        try {
            await this.httpClient.post('https://login.microsoft.com/common/oauth2/token', body, {
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
                        result.success = true
                        return result
                    }
                }
            }
        }

        throw new CatchAllVerificationError(result)
    }

    async mimecastLogin(username: string): Promise<CatchAllVerificationResult> {
        const countryCodes = ['us', 'uk']
        const result: CatchAllVerificationResult = {
            success: false,
            source: 'MimecastLogin',
        }

        const headers = {
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

        const body: MimecastData = {
            data: [
                {
                    emailAddress: username,
                },
            ],
        }

        const config: AxiosRequestConfig<MimecastData> = {
            headers,
        }

        const promises: Array<Promise<void>> = []
        for (const countryCode of countryCodes) {
            promises.push(
                new Promise<void>((resolve, reject) => {
                    this.httpClient
                        .post<
                            MimecastResponse,
                            MimecastData
                        >(`https://login-${countryCode}.mimecast.com/u/proxy/api/login/discover-authentication`, body, config)
                        .then(
                            value => {
                                const {
                                    data: [first],
                                } = value

                                const { authenticate: authTypes } = first

                                for (const authType of authTypes) {
                                    if (['Basic-Ad', 'Basic-Cloud'].includes(authType)) {
                                        resolve()
                                        return
                                    }
                                }

                                reject(new CatchAllVerificationError(result))
                            },
                            _ => {
                                reject(new CatchAllVerificationError(result))
                            },
                        )
                }),
            )
        }

        await Promise.any(promises)
        result.success = true
        return result
    }

    async officeapps(email: string): Promise<CatchAllVerificationResult> {
        const result: CatchAllVerificationResult = {
            success: false,
            source: 'OfficeApps',
        }

        const invalidResponses = ['OrgId,Placeholder', 'Neither', 'Error', 'Throttled']

        try {
            const response = await this.httpClient.get<string>(
                'https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=0&emailAddress=' + email,
                {
                    timeout: 30000,
                },
            )

            if (!invalidResponses.includes(response)) {
                result.success = true
                return result
            }
        } catch (error: unknown) {}

        throw new CatchAllVerificationError(result)
    }

    async linkedinLogin(email: string): Promise<CatchAllVerificationResult> {
        const result: CatchAllVerificationResult = {
            success: false,
            source: 'LinkedInLogin',
        }

        const headers = {
            cookie: 'bcookie="v=2&94d793ff-3191-4fdb-8e9c-8e846eb37b6d"; bscookie="v=1&20210425162229d7aace86-383e-4897-8df7-ef2e8081459bAQG1XKC1EADv0ey01Lsrx-VbwK2L23Gf"; _ga=GA1.2.1626453561.1619367752; _gid=GA1.2.2082382490.1619367752; timezone=Europe/Kiev; li_sugr=5052fd32-b062-4387-94d8-2a304947b84f; _guid=a67f28fa-0422-40b0-877a-3900719aa56e; aam_uuid=12566535922594159991244538136090272819; li_rm=AQGgYh0ajCahFwAAAXkJ2C3hyQ-DsCjTCV0z8jGUicTG1iC6q7eY8CRtP-C7trpiUc7WKftH5DbrU9HDvd2yQUa5gEbyjlmx7X52HmVlj-T7-AtHb2MiPqABrCq5IOcJOTJc9LKMe9-B6mWUKTv02X8dzGsSzyVPoVS1EIn5PhR9YgkMIIGmsubWbT94q5RJNiqUQ7KFOGx5QCJyKQM_l9_0HhH5AGflbMvOyXrjJN9OunZhI7Mu8Pjoju7LSK4xXocXazK7JincnW2AoMSAYuokYWCaCApzY5Xx-gZIZ4OX2ZG_RjwOfM330mxeZz5jS-aoFYswOfXvHR8akvQ; visit=v=1&M; _gcl_au=1.1.2119926763.1619367844; spectroscopyId=6ad5e72b-63a2-4557-acf5-8b285cfadcba; AMCVS_14215E3D5995C57C0A495C55%40AdobeOrg=1; fid=AQHjxQ7ny5r4yQAAAXkZfyLD4VWOb9-8ofH5cQklXtUNq4-q7lr38zVY8C0sydDdoQyr5VrZfF5slg; G_ENABLED_IDPS=google; fcookie=AQFm_3-kmR_GZgAAAXkZfzZqAa4VereTJ9gL7ayIVSNY44s7_oqz7wB7sqE1FJfhqNt913cxXrhT5JTSn_U3Y8GSyFMtHWpfkp_WmraW8sMbhkUALGFdcyh48AFSo4VkkkfE0P4Rged6kT0qEswOyA4NVXaRCc1M3NoM8GgC6wE9MI1mt_FSbz8oOdN5O-C5kHROtzTe_FjrPU3iLvvJgw33ZleOmD50s6At-D0MB2q1y0Ql061tShseBLGHQIZjzmpAawXIqZpX72yGnFrJ5ykMfTuNwKSHBivkNBDDq+OQGD/69aaXLfDkjtMGElOkt4gnNJdqs5rGprlzGbYN9j/u6zaw==; AnalyticsSyncHistory=AQI0wfbERS3idgAAAXkZ0kUfLWf6pjBWWPipnsPkDcsQO7t-P5UUUHO05bHCI1qz8Hu41gfxGLUaVBXPS9Mohw; lms_ads=AQH18T9yzB2cOAAAAXkZ0lAo6nqE2Asfpk2yMqBxu2DpI4JgSPg6iv6RCuFclHi7KKKiQyiqmtIZGpiQd4jZZCMkCHINb4K8; lms_analytics=AQH18T9yzB2cOAAAAXkZ0lAo6nqE2Asfpk2yMqBxu2DpI4JgSPg6iv6RCuFclHi7KKKiQyiqmtIZGpiQd4jZZCMkCHINb4K8; UserMatchHistory=AQJ6wPc024U6rwAAAXkfqn_et5oa97SUgGDIMumDcpnQBs21H5D9x3q9mfl0h9oEfWLH6iIQbKnl3M3dEuOaLnhPlTosmABlVFQU_HSbPPWm6-5ex7v5RYXX6cUwOu51Z5wwmse0AAq0K_jF_c0MUMnXjwXaKH9YJILUMZi94TMixi4PEHFDAvaW23mSFjamo2Ut_BxAcpZMZmcGa7PpWsOYXNfj-mhDUwPl0hZyY1PCr98AE3mCWJWUqvsVLFv7Mqu6r_QsZ1vmosCMf2hLym51Xy1brSbIEFZZOaY; JSESSIONID=ajax:4028146057124642913; lang=v=2&lang=ru-ru; lidc="b=VGST02:s=V:r=V:a=V:p=V:g=2319:u=1:i=1619734251:t=1619820651:v=2:sig=AQFyYEMoS7KznnMk9APFjJAuzi32wImb"; _gat=1; AMCV_14215E3D5995C57C0A495C55%40AdobeOrg=-637568504%7CMCIDTS%7C18746%7CMCMID%7C12789265851328584841263914918439327736%7CMCAAMLH-1620339052%7C6%7CMCAAMB-1620339052%7CRKhpRz8krg2tLO6pguXWp5olkAcUniQYPHaMWWgdJ3xzPWQmdj0y%7CMCOPTOUT-1619741452s%7CNONE%7CMCCIDH%7C-1534373624%7CvVersion%7C5.1.1; g_state={"i_p":1619741458136,"i_l":1}',
            origin: 'https://www.linkedin.com',
            referer: 'https://www.linkedin.com/signup/cold-join',
            'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
            'sec-ch-ua-mobile': '?0',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Safari/537.36',
            'x-nuxsupportscp': 'on',
        }

        const data = {
            csrfToken: 'ajax:4028146057124642913',
            pageInstance: 'urn:li:page:d_checkpoint_rp_requestPasswordReset;qatZDe6FQ3Sq2RTzpZ3TOg==',
            userName: email,
            encryptedEmail: 'false',
            fp_data: 'default',
            apfc: {},
        }

        try {
            await this.httpClient.post('https://www.linkedin.com/checkpoint/rp/request-password-reset-submit', data, {
                headers,
            })
        } catch (error) {
            if (error instanceof AxiosError && error.status === 400) {
                result.success = true
                return result
            }
        }

        throw new CatchAllVerificationError(result)
    }

    async tryAll(email: string): Promise<CatchAllVerificationResult> {
        try {
            return await Promise.any([
                this.mimecastLogin(email),
                this.officeapps(email),
                this.microsoftLogin(email),
                this.linkedinLogin(email),
                this.microsoftGetCreds(email),
            ])
        } catch (error) {
            throw new CatchAllVerificationError({
                source: 'None',
                success: false,
            })
        }
    }
}
