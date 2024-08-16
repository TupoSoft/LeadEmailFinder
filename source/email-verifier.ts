import {resolveMx} from 'node:dns/promises'
import {MxRecord} from "node:dns";

import {SMTPClient, SMTPResponseCode} from "./smtp"
import {generateRandomString} from "./util";
import rotator, {ProxyRotator} from "./proxy";

export const enum SMTPVerificationError {
    InvalidEmailFormat,
    NoMxRecords,
    SenderIdentificationFailed,
    CatchAll,
}

const enum DeliveryStatus {
    Accepted = "accepted",
    Rejected = "rejected",
    NotProcessed = "not-processed",
}

const enum CatchAllStatus {
    Enabled = "enabled",
    Disabled = "disabled",
    Unknown = "unknown",
}

interface VerificationData {
    email: string
    localPart: string
    domain: string
    error: SMTPVerificationError | null
    targetExchange?: MxRecord
    verifiedAt: number
    deliveryStatus: DeliveryStatus,
    catchAll: CatchAllStatus,
}

export class EmailVerifier {
    constructor(private readonly proxyRotator: ProxyRotator = rotator) {
    }

    verify(email: string): Promise<VerificationData> {
        return new Promise(async (resolve, reject) => {
                const data: VerificationData = {
                    deliveryStatus: DeliveryStatus.NotProcessed,
                    catchAll: CatchAllStatus.Unknown,
                    domain: "",
                    localPart: "",
                    error: null,
                    email: email,
                    verifiedAt: Date.now()
                }

                if (!this.isValidEmail(email)) {
                    reject(data)
                }

                [data.localPart, data.domain] = email.split('@')

                const mxRecords = await this.getMxRecords(data.domain)
                if (mxRecords.length < 0) {
                    data.error = SMTPVerificationError.NoMxRecords
                    return data
                }

                const activeConnection = new SMTPClient()
                const nextProxy = this.proxyRotator.getRandomProxy()

                try {
                    await activeConnection.connect({mxRecords: mxRecords, proxy: nextProxy})
                    await activeConnection.helo()

                    let code = await activeConnection.mailFrom()
                    if (code !== SMTPResponseCode.OK) {
                        data.error = SMTPVerificationError.SenderIdentificationFailed
                        resolve(data)
                    }


                    code = await activeConnection.rcptTo(generateRandomString(5) + email)
                    if (code === SMTPResponseCode.OK) {
                        data.error = SMTPVerificationError.CatchAll
                        resolve(data)
                    }

                    code = await activeConnection.rcptTo(email)
                    data.verifiedAt = Date.now()
                    if (code !== SMTPResponseCode.OK) {
                        data.catchAll = CatchAllStatus.Enabled
                        data.deliveryStatus = DeliveryStatus.Rejected
                        resolve(data)
                    } else {
                        data.catchAll = CatchAllStatus.Disabled
                        data.deliveryStatus = DeliveryStatus.Accepted
                        resolve(data)
                    }
                } catch (error) {
                    reject(error)
                } finally {
                    const code = await activeConnection?.quit();
                    if (code !== SMTPResponseCode.ServiceClosingTransmissionChannel) {
                        console.debug(`Service failed to close the transmission channel.`)
                    }
                }
            }
        )
    }

    private async getMxRecords(domain: string): Promise<MxRecord[]> {
        try {
            const mxRecords = await resolveMx(domain)
            mxRecords.sort((a, b) => {
                return a.priority - b.priority;
            })
            return mxRecords
        } catch (error: unknown) {
            console.debug(`Failed to get MX records for domain: ${domain}`)
            return []
        }
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}
