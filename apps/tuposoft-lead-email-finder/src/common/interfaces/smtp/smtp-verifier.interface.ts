import { ISmtpVerificationResponse } from './smtp-verification-response.interface'

export interface ISmtpVerifier {
    verify: (email: string) => Promise<ISmtpVerificationResponse>
}
