import { GetAsyncVerificationStatus, VerifyAsyncResponse } from './async-email-verification-service.interface'
import { Expose } from 'class-transformer'
import { JobState } from 'bullmq'
import { EmailVerificationResponseDto } from '../sync-email-verification/email-verification-response.dto'

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
