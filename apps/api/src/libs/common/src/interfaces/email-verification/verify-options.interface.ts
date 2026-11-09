import { EmailPatternEnum } from '../../enums'
import { VerificationTraceContext } from './verification-trace-context.interface'

export interface VerifyOptions {
    organizationId: string
    email: string
    format?: EmailPatternEnum
    batchId?: string
    trace?: VerificationTraceContext
}
