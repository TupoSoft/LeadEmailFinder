import { IEmailVerificationResponseDto, JobState } from '@tuposoft/lead-email-finder/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'

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
    verifyAsync(options: VerifyAsyncRequest, principal: AuthPrincipal, requestId?: string): Promise<VerifyAsyncResponse>

    getAsyncVerificationState(id: string, principal: AuthPrincipal): Promise<GetAsyncVerificationStatus>
}
