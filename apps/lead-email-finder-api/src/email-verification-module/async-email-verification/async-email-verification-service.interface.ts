import { IEmailVerificationResponseDto, JobState } from '@tuposoft/lead-email-finder/common'

export interface VerifyAsyncRequest {
    email: string
}

export interface VerifyAsyncResponse {
    id: string
}

export interface GetAsyncVerificationStatusRequestParams {
    id: string
}

export interface GetAsyncVerificationStatus {
    state: JobState
    result?: IEmailVerificationResponseDto
}

export interface AsyncEmailVerificationService {
    verifyAsync(options: VerifyAsyncRequest): Promise<VerifyAsyncResponse>

    getAsyncVerificationState(id: string): Promise<GetAsyncVerificationStatus>
}
