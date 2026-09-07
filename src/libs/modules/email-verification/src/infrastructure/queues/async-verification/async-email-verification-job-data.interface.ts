import type { VerifyOptions } from '@tuposoft/lead-email-finder/common'

export interface AsyncEmailVerificationJobData extends VerifyOptions {
    credentialId: string
}
