import type { EmailVerificationRepository } from '../../domain/repositories/EmailVerificationRepository'
import type { EmailVerification } from '../../domain/entities/EmailVerification'
import type { ProxyRotator } from '../../proxy'
import { CatchAllStatus, DeliveryStatus, SMTPVerificationError } from '../../domain/enums'
import { getMxRecords } from '../../dns'
import { SMTPClient, SMTPClientError, SMTPResponseCode } from '../../smtp'
import { generateRandomString } from '../../util'

export class VerifyEmail {
    constructor(
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly proxyRotator: ProxyRotator,
    ) {}

    async execute(email: string): Promise<EmailVerification> {
        const data: EmailVerification = {
            deliveryStatus: DeliveryStatus.NotProcessed,
            catchAll: CatchAllStatus.Unknown,
            domain: '',
            localPart: '',
            error: null,
            email,
            verifiedAt: new Date(),
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
