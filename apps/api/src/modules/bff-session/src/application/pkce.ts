import { createHash, randomBytes } from 'node:crypto'

export function generateState(): string {
    return randomBytes(24).toString('base64url')
}

export function generateNonce(): string {
    return randomBytes(24).toString('base64url')
}

export function generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url')
}

export function computeCodeChallengeS256(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url')
}

export function generateSessionId(): string {
    return randomBytes(32).toString('base64url')
}

export function generateCsrfToken(): string {
    return randomBytes(32).toString('base64url')
}
