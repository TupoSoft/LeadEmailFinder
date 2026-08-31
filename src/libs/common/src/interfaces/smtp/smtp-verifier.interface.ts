import { ISmtpVerificationResponse } from './smtp-verification-response.interface'

export interface ISmtpVerifier {
    verify: (organizationId: string, email: string) => Promise<ISmtpVerificationResponse>
}
