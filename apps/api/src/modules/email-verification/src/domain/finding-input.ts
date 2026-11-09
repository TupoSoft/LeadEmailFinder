import type { EmailPatternEnum } from '@tuposoft/lead-email-finder/common/enums/email/email-pattern.enum'

export type FindingInput = { firstName: string; lastName: string; domain: string }

export type EmailCandidate = { index: number; email: string; patterns: EmailPatternEnum[] }

export type GeneratedEmailCandidates = {
    generationVersion: 1
    normalized: FindingInput
    candidates: EmailCandidate[]
    omittedPatterns: { pattern: EmailPatternEnum; reason: 'address_too_long' }[]
}

export type FindingInputField = keyof FindingInput | 'input'

export type FindingInputErrorCode =
    | 'invalid_type'
    | 'required'
    | 'too_long'
    | 'control_characters'
    | 'unsupported_characters'
    | 'invalid_domain'
    | 'no_candidates'

export class FindingInputError extends Error {
    readonly name = 'FindingInputError'

    constructor(
        readonly field: FindingInputField,
        readonly code: FindingInputErrorCode,
    ) {
        super('Invalid email finding input.')
    }
}
