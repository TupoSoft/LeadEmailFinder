import type { VerificationTraceContext, VerifyOptions } from '@tuposoft/lead-email-finder/common'
import type { OwnedEmailVerification } from '../../../domain/email-verification'

export const RUN_SYNCHRONOUS_VERIFICATION = Symbol('RUN_SYNCHRONOUS_VERIFICATION')

export interface SynchronousVerificationCommand {
    organizationId: string
    email: string
    trace?: VerificationTraceContext & { mode: 'sync' }
}

export interface SynchronousVerificationCore {
    verify(options: VerifyOptions): Promise<OwnedEmailVerification>
}

export class RunSynchronousVerification {
    constructor(private readonly core: SynchronousVerificationCore) {}

    execute({ organizationId, email, trace }: SynchronousVerificationCommand): Promise<OwnedEmailVerification> {
        return this.core.verify({ organizationId, email: email.toLowerCase(), trace })
    }
}
