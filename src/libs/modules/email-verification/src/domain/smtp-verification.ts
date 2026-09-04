import { ISmtpVerificationResponse } from '@tuposoft/lead-email-finder/common'

export interface SmtpVerification {
    organizationId: string
    id: string
    reason: ISmtpVerificationResponse['reason']
    exists: boolean | null
    secureTransport: boolean
    targetExchange?: string
    proxyId?: string
    createdAt: Date
    updatedAt: Date
}
