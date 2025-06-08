import { ICatchAllVerifier } from '../../../../apps/lead-email-finder-api/src/common'
import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import { isNativeError } from 'node:util/types'

@Injectable()
export class OfficeApps implements ICatchAllVerifier {
    private static readonly URL = 'https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=0&emailAddress='

    private static readonly INVALID_RESPONSES = ['OrgId,Placeholder', 'Neither', 'Error', 'Throttled']

    sourceName = 'microsoft_2' as const

    constructor(
        @Optional()
        private readonly logger: Logger = new Logger(OfficeApps.name),
        private readonly httpClient: HttpService,
    ) {}

    verify: (email: string) => Promise<boolean> = async email => {
        const { URL: url, INVALID_RESPONSES: invalidResponses } = OfficeApps

        try {
            const { data: response } = await firstValueFrom(this.httpClient.get<string>(url + email))

            if (!invalidResponses.includes(response)) {
                return true
            }
        } catch (error: unknown) {
            if (isNativeError(error)) {
                this.logger.debug(
                    `OfficeApps catch all verification ended in error for email ${email}: ${error.message}`,
                )
            }
        }

        return false
    }
}
