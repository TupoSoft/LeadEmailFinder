import { IEmailVerificationResponseDto } from '@tuposoft/lead-email-finder/common'

export const VERIFICATION_RESULT_READER = Symbol('VERIFICATION_RESULT_READER')

export interface VerificationResultLookup {
    id: string
    organizationId: string
}

export interface VerificationResultReader {
    findOwned(lookup: VerificationResultLookup): Promise<IEmailVerificationResponseDto | null>
}
