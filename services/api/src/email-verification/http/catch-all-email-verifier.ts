import type { EmailVerificationSource } from '../dto'

export interface CatchAllEmailVerifier {
    sourceName: EmailVerificationSource
    verify: (email: string) => Promise<boolean>
}
