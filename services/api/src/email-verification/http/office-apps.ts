import type { HttpClient } from '../../http-client'
import type { EmailVerificationResult, EmailVerifier } from '../email-verifier'

export class OfficeApps implements EmailVerifier {
    private static readonly URL = 'https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=0&emailAddress='

    private static readonly INVALID_RESPONSES = ['OrgId,Placeholder', 'Neither', 'Error', 'Throttled']

    constructor(private readonly httpClient: HttpClient) {}

    verify: (email: string) => Promise<EmailVerificationResult> = async email => {
        const result: EmailVerificationResult = {
            success: false,
        }

        const { URL: url, INVALID_RESPONSES: invalidResponses } = OfficeApps

        try {
            const response = await this.httpClient.get<string>(url + email)

            if (!invalidResponses.includes(response)) {
                result.success = true
            }
        } catch (error: unknown) {}

        return result
    }
}
