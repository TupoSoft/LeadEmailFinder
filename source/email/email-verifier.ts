import type { MxRecord } from 'node:dns'

import { SMTPClient, SMTPClientError, SMTPResponseCode } from '../smtp'
import { generateRandomString } from '../util'
import type { ProxyRotator } from '../proxy'
import { getMxRecords } from '../dns'
import { CatchAllStatus, DeliveryStatus } from './enums'

export const enum SMTPVerificationError {
    NoMxRecords,
    SenderIdentificationFailed,
    CatchAll,
}

interface VerificationData {
    email: string
    localPart: string
    domain: string
    error: SMTPVerificationError | null
    targetExchange?: MxRecord
    verifiedAt: number
    deliveryStatus: DeliveryStatus
    catchAll: CatchAllStatus
}

export class EmailVerifier {
    constructor(private readonly proxyRotator: ProxyRotator) {}

    async verify(email: string): Promise<VerificationData> {
        const data: VerificationData = {
            deliveryStatus: DeliveryStatus.NotProcessed,
            catchAll: CatchAllStatus.Unknown,
            domain: '',
            localPart: '',
            error: null,
            email,
            verifiedAt: Date.now(),
        }

        const [localPart, domain] = email.split('@')
        data.localPart = localPart
        data.domain = domain

        const mxRecords = await getMxRecords(data.domain)
        if (mxRecords.length < 0) {
            data.error = SMTPVerificationError.NoMxRecords
            return data
        }

        const activeConnection = new SMTPClient()
        const nextProxy = this.proxyRotator.getRandomProxy()

        try {
            await activeConnection.connect({ mxRecords, proxy: nextProxy })
            await activeConnection.helo()

            let code = await activeConnection.mailFrom()
            if (code !== SMTPResponseCode.OK) {
                data.error = SMTPVerificationError.SenderIdentificationFailed
                return data
            }

            code = await activeConnection.rcptTo(generateRandomString(5) + email)
            if (code === SMTPResponseCode.OK) {
                data.catchAll = CatchAllStatus.Enabled
                data.deliveryStatus = DeliveryStatus.Accepted
                return data
            } else {
                data.catchAll = CatchAllStatus.Disabled
            }

            code = await activeConnection.rcptTo(email)
            data.verifiedAt = Date.now()
            if (code !== SMTPResponseCode.OK) {
                data.deliveryStatus = DeliveryStatus.Rejected
            } else {
                data.deliveryStatus = DeliveryStatus.Accepted
            }
        } catch (error) {
            if (error instanceof SMTPClientError) {
                data.error = error.code
            } else if (error instanceof Error) {
                throw error
            }
        } finally {
            const code = await activeConnection?.quit()
            if (code !== SMTPResponseCode.ServiceClosingTransmissionChannel) {
                console.debug('Service failed to close the transmission channel.')
            }
        }

        return data
    }
}
