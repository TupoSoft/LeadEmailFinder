import type { EmailVerificationRepository } from '../../../domain/repositories/EmailVerificationRepository'
import type { EmailVerification } from '../../../domain/entities/EmailVerification'
import type { ProxyRotator } from '../../../util/proxy'
import type { MxRecord } from 'node:dns'
import { resolveMx } from 'node:dns/promises'
import { SMTPResponseCode } from './SMTPResponseCode'
import { SMTPClient } from './SMTPClient'
import { SMTPClientError } from './SMTPClientError'
import { generateRandomString } from '../../../util/random'
import { CatchAllStatus, DeliveryStatus, SMTPVerificationError } from '../../../domain/enums'
import type { CatchAllVerifier } from './CatchAllVerifier'

export class VerifyEmail {
    constructor(
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly proxyRotator: ProxyRotator,
        private readonly catchAllVerifier: CatchAllVerifier,
    ) {}

    private static async getMxRecords(domain: string): Promise<MxRecord[]> {
        try {
            const mxRecords = await resolveMx(domain)
            mxRecords.sort((a, b) => {
                return a.priority - b.priority
            })
            return mxRecords
        } catch (error: unknown) {
            console.debug(`Failed to get MX records for domain: ${domain}`)
            return []
        }
    }

    async execute(email: string): Promise<EmailVerification> {
        const [localPart, domain] = email.split('@')

        const data: EmailVerification = {
            deliveryStatus: DeliveryStatus.Unknown,
            catchAll: CatchAllStatus.Unknown,
            source: 'None',
            domain,
            localPart,
            email,
            verifiedAt: new Date(),
        }

        const mxRecords = await VerifyEmail.getMxRecords(data.domain)
        if (mxRecords.length < 0) {
            data.error = SMTPVerificationError.NoMxRecords
            return data
        }

        const activeConnection: SMTPClient = new SMTPClient()
        const nextProxy = this.proxyRotator.getRandomProxy()

        try {
            const mxRecord = await activeConnection.connect({ mxRecords, proxy: nextProxy })
            data.targetExchange = mxRecord.exchange

            await activeConnection.helo()

            let code = await activeConnection.mailFrom()
            if (code !== SMTPResponseCode.OK) {
                data.error = SMTPVerificationError.SenderIdentificationFailed
                return data
            }

            code = await activeConnection.rcptTo(generateRandomString(5) + email)
            if (code === SMTPResponseCode.OK) {
                data.catchAll = CatchAllStatus.Enabled
                data.deliveryStatus = DeliveryStatus.Unknown
                return data
            } else {
                data.catchAll = CatchAllStatus.Disabled
            }

            code = await activeConnection.rcptTo(email)
            data.verifiedAt = new Date()
            if (code !== SMTPResponseCode.OK) {
                data.deliveryStatus = DeliveryStatus.Rejected
            } else {
                data.deliveryStatus = DeliveryStatus.Accepted
                data.source = 'SMTP'
            }
        } catch (error) {
            if (error instanceof SMTPClientError) {
                data.error = error.code
            } else if (error instanceof Error) {
                throw error
            }
        } finally {
            if (activeConnection.isReady()) {
                const code = await activeConnection?.quit()
                if (code !== SMTPResponseCode.ServiceClosingTransmissionChannel) {
                    console.debug('Service failed to close the transmission channel.')
                }
            }
        }

        await this.emailVerificationRepository.save(data)

        return data
    }
}
