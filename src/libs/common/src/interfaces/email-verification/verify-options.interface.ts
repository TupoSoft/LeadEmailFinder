import { EmailPatternEnum } from '../../enums'

export interface VerifyOptions {
    organizationId: string
    email: string
    format?: EmailPatternEnum
    batchId?: string
}
