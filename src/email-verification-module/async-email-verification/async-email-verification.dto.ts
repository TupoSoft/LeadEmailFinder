import {
    GetAsyncVerificationStatus,
    VerifyAsyncRequest,
    VerifyAsyncResponse,
} from './async-email-verification-service.interface'
import { Expose } from 'class-transformer'
import { EmailVerificationResponseDto } from '../sync-email-verification/email-verification-response.dto'
import { JobState } from './job-state.enum'
import { IsEmail } from 'class-validator'

export class VerifyAsyncRequestDto implements VerifyAsyncRequest {
    @Expose()
    @IsEmail()
    email: string
}

export class VerifyAsyncResponseDto implements VerifyAsyncResponse {
    @Expose()
    id: string
}

export class GetAsyncVerificationStatusDto implements GetAsyncVerificationStatus {
    @Expose()
    state: JobState

    @Expose()
    result?: EmailVerificationResponseDto
}
