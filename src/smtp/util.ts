import { SMTPResponseCode } from './enums'
import { SMTPClientError, SMTPClientErrorCode } from './errors'

export function getSmtpResponseCode(response: string): SMTPResponseCode {
    const FIRST_CHAR = 0
    const FOURTH_CHAR = 3

    const responseCode = Number(response.substring(FIRST_CHAR, FOURTH_CHAR))

    if (Object.values(SMTPResponseCode).includes(responseCode)) {
        return responseCode as SMTPResponseCode
    }

    throw new SMTPClientError(SMTPClientErrorCode.UnknownErrorCode, 'Unknown code: ' + responseCode)
}

export function isLastLine(line: string): boolean {
    const regex = /^\d{3} /
    return regex.test(line)
}
