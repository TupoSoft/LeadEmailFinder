import type { EmailVerificationRepository } from '../../../domain/repositories/EmailVerificationRepository'
import type { EmailVerification } from '../../../domain/entities/EmailVerification'
import type { ProxyRotator } from '../../../util/proxy'
import { SMTPClient, SMTPClientError, SMTPSessionInitiationFailedError } from './SMTPClient'
import { CatchAllStatus, DeliveryStatus } from '../../../domain/enums'
import type { CatchAllVerifier } from './CatchAllVerifier'

import type { MxRecord } from 'node:dns'
import { resolveMx } from 'node:dns/promises'
import { ProxySocket } from './ProxySocket'

export class VerifyEmail {
    constructor(
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly proxyRotator: ProxyRotator,
        private readonly catchAllVerifier: CatchAllVerifier,
    ) {}

    private static async getMxRecords(domain: string): Promise<MxRecord[]> {
        const mxRecords = await resolveMx(domain)
        mxRecords.sort((a, b) => {
            return a.priority - b.priority
        })
        return mxRecords
    }

    private static getSecondLevelDomainSplit(domain: string): string | undefined {
        const parts = domain.split('.')
        if (parts.length < 2) return
        return parts.slice(-2).join('.')
    }

    private static appendRandomPrefixToEmail(email: string): string {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        let result = ''
        for (let i = 0; i < 5; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length)
            result += characters[randomIndex]
        }
        return result + email
    }

    async execute(email: string): Promise<EmailVerification> {
        const [localPart, domain] = email.split('@')

        const data: EmailVerification = {
            deliveryStatus: DeliveryStatus.Unknown,
            success: false,
            catchAll: CatchAllStatus.Unknown,
            source: 'None',
            domain,
            localPart,
            email,
            verifiedAt: new Date(),
        }

        const socket: ProxySocket = new ProxySocket({
            proxy: this.proxyRotator.getRandomProxy(),
        })
        const client: SMTPClient = new SMTPClient(socket)

        try {
            const mxRecords = await VerifyEmail.getMxRecords(data.domain)
            const mxRecord = await client.connect({ mxRecords })
            data.targetExchange = mxRecord.exchange
            data.mxDomain = VerifyEmail.getSecondLevelDomainSplit(mxRecord.exchange)

            await client.helo()
            await client.mailFrom()

            data.catchAll = await client.rcptTo(VerifyEmail.appendRandomPrefixToEmail(email)).then(
                _ => CatchAllStatus.Enabled,
                _ => CatchAllStatus.Disabled,
            )

            if (data.catchAll === CatchAllStatus.Disabled) {
                data.deliveryStatus = await client.rcptTo(email).then(
                    _ => DeliveryStatus.Accepted,
                    _ => DeliveryStatus.Rejected,
                )

                data.source = 'SMTP'
            } else {
                data.deliveryStatus = DeliveryStatus.Unknown
            }

            if (data.deliveryStatus === DeliveryStatus.Accepted) {
                data.success = true
            }

            await client.quit()
        } catch (error) {
            if (error instanceof SMTPClientError) {
                if (error instanceof SMTPSessionInitiationFailedError) {
                    const [mxRecord] = error.mxRecords
                    data.targetExchange = mxRecord.exchange
                }

                data.error = error.name
            }
        }

        if (data.catchAll === CatchAllStatus.Enabled || data.deliveryStatus === DeliveryStatus.Unknown) {
            await this.catchAllVerifier
                .tryAll(email)
                .then(({ success, source }) => {
                    data.source = source
                    data.success = success
                })
                .catch(reason => {
                    console.error(reason)
                })
        }

        data.verifiedAt = new Date()
        await this.emailVerificationRepository.save(data)

        return data
    }
}
