import {promises as dns} from 'dns'
import net from "net"

import PromiseSocket from "promise-socket";
import express, {Request, Response} from "express";

type Result<T, E extends Error = Error> = { success: true, result: T } | { success: false, error: E }

enum SMTPResponseCode {
    // 2xx: Success
    SERVICE_READY = 220,
    OK = 250,                // Requested mail action okay, completed.
    MAIL_ACTION_OK = 251,    // User not local; will forward to <forward-path>.

    // 3xx: Positive Completion
    READY_FOR_MORE_INFO = 354, // Start mail input; end with <CRLF>.<CRLF>.

    // 4xx: Temporary Failures
    TEMPORARY_FAILURE = 421,     // Service not available, closing transmission channel.
    MAILBOX_UNAVAILABLE = 450,   // Requested mail action not taken: mailbox unavailable.
    PROCESSING_ABORTED = 451,    // Requested action aborted: error in processing.
    INSUFFICIENT_STORAGE = 452,   // Requested action not taken: insufficient storage space.

    // 5xx: Permanent Failures
    SYNTAX_ERROR = 500,          // Syntax error, command unrecognized.
    COMMAND_NOT_IMPLEMENTED = 502, // Command not implemented.
    BAD_SEQUENCE = 503,           // Bad sequence of commands.
    NOT_AUTHORIZED = 530,         // Authentication required.
    MAILBOX_NOT_FOUND = 550,      // Requested action not taken: mailbox unavailable.
    USER_NOT_LOCAL = 551,         // User not local; please try <forward-path>.
    UNAVAILABLE = 552,            // Requested mail action aborted: exceeded storage allocation.
    UNKNOWN_ERROR = 553,          // Requested action not taken: mailbox name not allowed.
    TRANSACTION_FAILED = 554,     // Transaction failed.
}

enum SMTPVerificationResult {
    InvalidEmailFormat,
    NoMxRecords,
    SessionInitiationFailed,
}

interface SMTPVerificationData {
    email: string
    isValid: boolean
    result: SMTPVerificationResult
    verifiedAt?: Date
}

function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function getDomainFromSubdomain(subdomain: string): Result<string> {
    try {
        const url = new URL(`https://${subdomain}`);
        const domain = url.hostname.split('.').slice(-2).join('.');
        return {success: true, result: domain}
    } catch (error) {
        return {success: false, error: new Error('Invalid domain')}
    }
}

function parseSmtpResponse(response: string): SMTPResponseCode {
    const responseCode = Number(response.substring(0, 3))

    if (Object.values(SMTPResponseCode).includes(responseCode)) {
        return responseCode as SMTPResponseCode;
    }

    throw new Error('Unknown error code: ' + responseCode)
}

async function verify(email: string): Promise<SMTPVerificationData> {
    const result: SMTPVerificationData = {
        result: SMTPVerificationResult.InvalidEmailFormat,
        email: email,
        isValid: false
    }

    if (!isValidEmail(email)) {
        return result
    }

    const [localPart, domain] = email.split('@')
    const mxRecords = await dns.resolveMx(domain)
    const targetExchange = mxRecords[0].exchange

    const socket = new net.Socket()
    const promiseSocket = new PromiseSocket(socket)

    console.log(`Connecting to ${targetExchange} on port 25`)

    await promiseSocket.connect(25, mxRecords[0].exchange);

    console.log('Connection successful')

    const response = await promiseSocket.readAll() as string

    console.log(`Received:\n${response}`)

    const code = parseSmtpResponse(response)
    if (code != SMTPResponseCode.SERVICE_READY) {
        result.result = SMTPVerificationResult.SessionInitiationFailed;
        return result;
    }

    const QUIT_CMD = "QUIT\r\n"
    console.log(`Sending: ${QUIT_CMD}`)

    await promiseSocket.writeAll(QUIT_CMD);
    await promiseSocket.end()

    console.log('Socket closed.')

    return result
}

const app = express()
const port = process.env.PORT || 3000

app.get('/verify', async (req: Request, res: Response) => {
    const email = req.query.email as string
    const verificationData = await verify(email)
    res.json(verificationData)
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})
