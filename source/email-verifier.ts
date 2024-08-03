import {resolveMx} from 'node:dns/promises'
import {constants as httpConstants} from "node:http2";
import express, {Request, Response} from "express"
import {MxRecord} from "node:dns";

import {SMTPClient, SMTPResponseCode} from "./smtp"
import networkInterfacesRR from "./os"

const enum SMTPVerificationResult {
    Undefined,
    InvalidEmailFormat,
    NoMxRecords,
    SessionInitiationFailed,
    ClientInitiationFailed,
    SenderIdentificationFailed,
    CatchAll,
    ForwardPathAccepted,
    ForwardPathRejected,
}

interface SMTPVerificationData {
    email: string
    localPart: string
    domain: string
    result: SMTPVerificationResult
    targetExchange?: MxRecord
    verifiedAt: number
}

class EmailVerifier {
    private activeConnections: Record<string, SMTPClient> = {}

    verify(email: string): Promise<SMTPVerificationData> {
        return new Promise(async (resolve, reject) => {
                const data: SMTPVerificationData = {
                    domain: "",
                    localPart: "",
                    result: SMTPVerificationResult.Undefined,
                    email: email,
                    verifiedAt: Date.now()
                }

                if (!this.isValidEmail(email)) {
                    reject(data)
                }

                [data.localPart, data.domain] = email.split('@')

                const mxRecords = await this.getMxRecords(data.domain)
                if (mxRecords.length < 0) {
                    data.result = SMTPVerificationResult.NoMxRecords
                    return data
                }

                let activeConnection = this.findActiveConnections(mxRecords)

                try {
                    if (activeConnection) {
                        const code = await activeConnection.rcptTo(email)
                        if (code === SMTPResponseCode.OK) {
                            data.result = SMTPVerificationResult.ForwardPathAccepted
                        } else {
                            data.result = SMTPVerificationResult.ForwardPathRejected
                        }
                    } else {
                        activeConnection = new SMTPClient()
                        const nextInterface = networkInterfacesRR.next()
                        const targetExchange = await activeConnection.connect(mxRecords, nextInterface)

                        let code = await activeConnection.helo()
                        if (code !== SMTPResponseCode.OK) {
                            data.result = SMTPVerificationResult.ClientInitiationFailed
                            resolve(data)
                        }

                        code = await activeConnection.mailFrom()
                        if (code !== SMTPResponseCode.OK) {
                            data.result = SMTPVerificationResult.SenderIdentificationFailed
                            resolve(data)
                        }


                        code = await activeConnection.rcptTo(this.generateRandomString(5) + email)
                        if (code === SMTPResponseCode.OK) {
                            data.result = SMTPVerificationResult.CatchAll
                            resolve(data)
                        }

                        this.activeConnections[targetExchange.exchange] = activeConnection

                        code = await activeConnection.rcptTo(email)
                        if (code === SMTPResponseCode.OK) {
                            data.result = SMTPVerificationResult.ForwardPathAccepted
                        } else {
                            data.result = SMTPVerificationResult.ForwardPathRejected
                        }

                        data.verifiedAt = Date.now()

                        resolve(data)

                    }
                } catch
                    (error) {
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

    private findActiveConnections(mxRecords: MxRecord[]):
        SMTPClient | undefined {
        const match = mxRecords.find(value => this.activeConnections[value.exchange])

        if (match) {
            const activeConnection = this.activeConnections[match.exchange]
            if (activeConnection.isReady()) {
                return activeConnection
            } else {

            }
        }
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

    private generateRandomString(length: number): string {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        let result = ''
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length)
            result += characters[randomIndex]
        }
        return result
    }
}

const app = express()
const port = process.env.PORT || 3000
const emailVerifier = new EmailVerifier()

app.get('/verify', async (req: Request, res: Response) => {
    const email = req.query.email as string
    const verificationData = await emailVerifier.verify(email)

    if (verificationData.result === SMTPVerificationResult.InvalidEmailFormat
    ) {
        res.status(httpConstants.HTTP_STATUS_BAD_REQUEST)
    }

    res.json(verificationData)
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})
