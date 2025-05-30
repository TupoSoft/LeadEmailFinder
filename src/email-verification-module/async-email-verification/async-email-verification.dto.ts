import {
    GetAsyncVerificationStatus,
    GetAsyncVerificationStatusRequestParams,
    VerifyAsyncRequest,
    VerifyAsyncResponse,
} from './async-email-verification-service.interface'
import { Expose } from 'class-transformer'
import { EmailVerificationResponseDto } from '../sync-email-verification/email-verification-response.dto'
import { JobState } from './job-state.enum'
import { IsEmail, IsUUID } from 'class-validator'
import { HOST_BLACKLIST } from '../email-verification.constants'

export class VerifyAsyncRequestBodyDto implements VerifyAsyncRequest {
    @IsEmail({ host_blacklist: HOST_BLACKLIST })
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
