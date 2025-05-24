import { MicrosoftLoginErrorCode } from './microsoft-login-error-code.enum'

export interface IMicrosoftLoginErrorData {
    error_codes: MicrosoftLoginErrorCode[]
}
