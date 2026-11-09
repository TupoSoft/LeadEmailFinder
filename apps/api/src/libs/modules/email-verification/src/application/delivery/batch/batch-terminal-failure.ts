import { InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'

export const BATCH_TERMINAL_FAILURE_CODES = ['invalid_csv', 'insufficient_credits', 'processing_failed'] as const

export type BatchTerminalFailureCode = (typeof BATCH_TERMINAL_FAILURE_CODES)[number]

export class InvalidBatchCsvError extends Error {
    constructor() {
        super('batch_email_verification_csv_invalid')
        this.name = 'InvalidBatchCsvError'
    }
}

/** Call only for a real failure, after infrastructure has handled worker control signals. */
export function classifyBatchTerminalFailure(error: unknown): BatchTerminalFailureCode {
    if (error instanceof InvalidBatchCsvError) return 'invalid_csv'
    if (error instanceof InsufficientCreditsException) return 'insufficient_credits'
    return 'processing_failed'
}

export function safeBatchTerminalFailureCode(value: unknown): BatchTerminalFailureCode {
    return BATCH_TERMINAL_FAILURE_CODES.find(code => code === value) ?? 'processing_failed'
}
