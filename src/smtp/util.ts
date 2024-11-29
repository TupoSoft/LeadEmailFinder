import { SMTPResponseCode } from './enums'
import { SMTPClientError, SMTPClientErrorCode } from './errors'

export function getSmtpResponseCode(response: string): SMTPResponseCode {
    const responseCode = Number(response.substring(0, 3))

    if (Object.values(SMTPResponseCode).includes(responseCode)) {
        return responseCode as SMTPResponseCode
    }

    throw new SMTPClientError(SMTPClientErrorCode.UnknownErrorCode, 'Unknown code: ' + responseCode)
}

export function isLastLine(line: string): boolean {
    const regex = /^\d{3} /
    return regex.test(line)
}
