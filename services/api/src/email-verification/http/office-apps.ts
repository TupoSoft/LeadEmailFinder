import type { CatchAllEmailVerifier } from './catch-all-email-verifier'
import type { HttpClient } from '../../http-client'

export class OfficeApps implements CatchAllEmailVerifier {
    private static readonly URL = 'https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=0&emailAddress='

    private static readonly INVALID_RESPONSES = ['OrgId,Placeholder', 'Neither', 'Error', 'Throttled']

    constructor(private readonly httpClient: HttpClient) {}

    verify: (email: string) => Promise<boolean> = async email => {
        const { URL: url, INVALID_RESPONSES: invalidResponses } = OfficeApps

        try {
            const response = await this.httpClient.get<string>(url + email)

            if (!invalidResponses.includes(response)) {
                return true
            }
        } catch (error: unknown) {}

        return false
    }
}
