import {
    GetAsyncVerificationStatus,
    GetAsyncVerificationStatusRequestParams,
    VerifyAsyncRequest,
    VerifyAsyncResponse,
} from './async-email-verification-service.interface'
import { Expose } from 'class-transformer'
import { EmailVerificationResponseDto } from '../sync-email-verification'
import { JobState } from '@tuposoft/lead-email-finder/common'
import { IsUUID } from 'class-validator'
import { IsVerifiableEmail } from '../is-verifiable-email.decorator'

export class VerifyAsyncRequestBodyDto implements VerifyAsyncRequest {
    @IsVerifiableEmail()
    email: string
}

export class VerifyAsyncResponseDto implements VerifyAsyncResponse {
    @Expose()
    @IsUUID()
    id: string
}

export class GetAsyncVerificationStatusRequestParamsDto implements GetAsyncVerificationStatusRequestParams {
    @IsUUID()
    id: string
}

export class GetAsyncVerificationStatusResponseDto implements GetAsyncVerificationStatus {
    @Expose()
    state: JobState

    @Expose()
    result?: EmailVerificationResponseDto
}
