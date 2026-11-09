import { BetterAuthAccountEntity } from './better-auth-account.entity'
import { BetterAuthSessionEntity } from './better-auth-session.entity'
import { BetterAuthTwoFactorEntity } from './better-auth-two-factor.entity'
import { BetterAuthUserEntity } from './better-auth-user.entity'
import { BetterAuthVerificationEntity } from './better-auth-verification.entity'

export const BETTER_AUTH_ENTITIES = [
    BetterAuthUserEntity,
    BetterAuthSessionEntity,
    BetterAuthAccountEntity,
    BetterAuthVerificationEntity,
    BetterAuthTwoFactorEntity,
]
