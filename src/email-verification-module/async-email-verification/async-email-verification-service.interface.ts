import { JobState } from 'bullmq'
import { IEmailVerificationResponseDto } from '../../common'

export interface VerifyAsyncResponse {
    id: string
}

export interface GetAsyncVerificationStatus {
    state: JobState
    result?: IEmailVerificationResponseDto
}

export interface AsyncEmailVerificationService {
    verifyAsync(email: string): Promise<VerifyAsyncResponse>

    getAsyncVerificationState(id: string): Promise<GetAsyncVerificationStatus>
}
