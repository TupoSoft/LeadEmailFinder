export const VERIFICATION_CLOCK = Symbol('VERIFICATION_CLOCK')

export interface VerificationClock {
    now(): Date
}
