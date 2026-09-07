import { Expose, Type } from 'class-transformer'
import { JobState } from '@tuposoft/lead-email-finder/common'
import { IsUUID } from 'class-validator'
import { EmailVerificationResponseDto } from '../../email-verification-response.dto'
import { IsVerifiableEmail } from '../synchronous-verification/is-verifiable-email.decorator'
import { AsyncVerificationStatus } from '../../../application/delivery/async/async-email-verification.service'

export class VerifyAsyncRequestBodyDto {
    @IsVerifiableEmail()
    email: string
}

export class VerifyAsyncResponseDto {
    @Expose()
    @IsUUID()
    id: string
}

export class GetAsyncVerificationStatusRequestParamsDto {
    @IsUUID()
    id: string
}

export class GetAsyncVerificationStatusResponseDto implements AsyncVerificationStatus {
    @Expose()
    state: JobState

    @Expose()
    @Type(() => EmailVerificationResponseDto)
    result?: EmailVerificationResponseDto
}
