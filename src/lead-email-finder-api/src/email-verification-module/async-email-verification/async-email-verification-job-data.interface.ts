import { VerifyOptions } from '@tuposoft/lead-email-finder/common'

export interface AsyncEmailVerificationJobData extends VerifyOptions {
    organizationId: string
    credentialId: string
}
