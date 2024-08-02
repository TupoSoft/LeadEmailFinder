import dns from 'dns/promises'
import {constants as httpConstants} from "node:http2";
import express, {Request, Response} from "express"

import {SMTPClient} from "./SMTPClient"
import {SMTPResponseCode} from "./SMTPResponseCode";

const app = express()
const port = process.env.PORT || 3000

app.get('/verify', async (req: Request, res: Response) => {
    const email = req.query.email as string
    const verificationData = await verify(email)

    if (verificationData.result == SMTPVerificationResult.InvalidEmailFormat) {
        res.status(httpConstants.HTTP_STATUS_BAD_REQUEST)
    }

    res.json(verificationData)
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})

enum SMTPVerificationResult {
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
    verifiedAt?: number
}

function verify(email: string): Promise<SMTPVerificationData> {
    return new Promise(async (resolve, reject) => {
        const data: SMTPVerificationData = {
            domain: "",
            localPart: "",
            result: SMTPVerificationResult.Undefined,
            email: email,
            verifiedAt: Date.now()
        }

        if (!isValidEmail(email)) {
            reject(data)
        }

        const [localPart, domain] = email.split('@')
        data.localPart = localPart
        data.domain = domain

        const smtpClient = new SMTPClient()

        try {
            const mxRecords = await dns.resolveMx(domain)
            const targetExchange = mxRecords[0].exchange

            let code = await smtpClient.connect(targetExchange)
            if (code !== SMTPResponseCode.SERVICE_READY) {
                data.result = SMTPVerificationResult.SessionInitiationFailed
                resolve(data)
            }

            code = await smtpClient.helo()
            if (code !== SMTPResponseCode.OK) {
                data.result = SMTPVerificationResult.ClientInitiationFailed
                resolve(data)
            }

            code = await smtpClient.mailFrom()
            if (code !== SMTPResponseCode.OK) {
                data.result = SMTPVerificationResult.SenderIdentificationFailed
                resolve(data)
            }


            code = await smtpClient.rcptTo(generateRandomString(5) + email)
            if (code === SMTPResponseCode.OK) {
                data.result = SMTPVerificationResult.CatchAll
                resolve(data)
            }

            code = await smtpClient.rcptTo(email)
            if (code === SMTPResponseCode.OK) {
                data.result = SMTPVerificationResult.ForwardPathAccepted
            } else {
                data.result = SMTPVerificationResult.ForwardPathRejected
            }

            data.verifiedAt = Date.now()

            resolve(data)
        } catch (error) {
            reject(error)
        } finally {
            const code = await smtpClient.quit();
            if (code !== SMTPResponseCode.SERVICE_CLOSING_TRANSMISSION_CHANNEL) {
                console.debug(`Service failed to close the transmission channel.`)
            }
        }
    })
}

function generateRandomString(length: number): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length)
        result += characters[randomIndex]
    }
    return result
}

function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
