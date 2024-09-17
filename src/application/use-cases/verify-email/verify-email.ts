import type { EmailVerificationRepository } from '../../../domain/repositories/EmailVerificationRepository'
import type { EmailVerification } from '../../../domain/entities/EmailVerification'
import type { ProxyRotator } from '../../../util/proxy'
import type { MxRecord } from 'node:dns'
import { resolveMx } from 'node:dns/promises'
import { SMTPResponseCode } from './smtp-response-code'
import { SMTPClient } from './smtp-client'
import { SMTPClientError } from './smtp-client-error'
import { generateRandomString } from '../../../util/random'
import { CatchAllStatus, DeliveryStatus, SMTPVerificationError } from '../../../domain/enums'

export class VerifyEmail {
    constructor(
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly proxyRotator: ProxyRotator,
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
        const data: EmailVerification = {
            deliveryStatus: DeliveryStatus.NotProcessed,
            catchAll: CatchAllStatus.Unknown,
            domain: '',
            localPart: '',
            email,
            verifiedAt: new Date(),
        }

        const [localPart, domain] = email.split('@')
        data.localPart = localPart
        data.domain = domain

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
                data.deliveryStatus = DeliveryStatus.Accepted
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
