import { Expose } from 'class-transformer'
import { EmailPatternEnum } from '../../email-module'
import { EmailVerificationSource } from '../enums'

export class EmailVerificationResultDto {
    @Expose()
    id: string

    @Expose()
    email: string

    @Expose()
    domain: string

    @Expose()
    localPart: string

    @Expose()
    format?: EmailPatternEnum

    @Expose()
    mxDomain?: string

    @Expose()
    targetExchange?: string

    @Expose()
    sources: EmailVerificationSource[]

    @Expose()
    exists: boolean | null

    @Expose()
    catchAll: boolean | null
}
