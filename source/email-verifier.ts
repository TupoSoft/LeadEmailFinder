import type { MxRecord } from 'node:dns'

import { SMTPClient, SMTPClientError, SMTPResponseCode } from './smtp'
import { generateRandomString } from './util'
import rotator, { type ProxyRotator } from './proxy'
import { getMxRecords } from './dns'

export const enum SMTPVerificationError {
    InvalidEmailFormat,
    NoMxRecords,
    SenderIdentificationFailed,
    CatchAll,
}

const enum DeliveryStatus {
    Accepted = 'accepted',
    Rejected = 'rejected',
    NotProcessed = 'not-processed',
}

const enum CatchAllStatus {
    Enabled = 'enabled',
    Disabled = 'disabled',
    Unknown = 'unknown',
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
    constructor(private readonly proxyRotator: ProxyRotator = rotator) {
    }

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
                data.error = SMTPVerificationError.CatchAll
                return data
            }

            code = await activeConnection.rcptTo(email)
            data.verifiedAt = Date.now()
            if (code !== SMTPResponseCode.OK) {
                data.catchAll = CatchAllStatus.Enabled
                data.deliveryStatus = DeliveryStatus.Rejected
                return data
            } else {
                data.catchAll = CatchAllStatus.Disabled
                data.deliveryStatus = DeliveryStatus.Accepted
                return data
            }
        } catch (error) {
            if (error instanceof SMTPClientError) {
                data.error = error.code
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
