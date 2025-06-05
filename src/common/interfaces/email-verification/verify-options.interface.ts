import { EmailPatternEnum } from '../../enums'

export interface VerifyOptions {
    email: string
    format?: EmailPatternEnum
    batchId?: string
}
