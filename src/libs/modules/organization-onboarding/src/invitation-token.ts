import { createHash, randomBytes } from 'node:crypto'

export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000

export interface GeneratedInvitationToken {
    readonly rawToken: string
    readonly tokenHash: string
}

export function generateInvitationToken(): GeneratedInvitationToken {
    const rawToken = randomBytes(32).toString('base64url')
    const tokenHash = hashInvitationToken(rawToken)

    return { rawToken, tokenHash }
}

export function hashInvitationToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex')
}
