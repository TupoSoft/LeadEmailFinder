export interface EmailVerificationResult {
    success: boolean
    error?: string
}

export interface EmailVerifier<T extends EmailVerificationResult = EmailVerificationResult> {
    verify: (email: string) => Promise<T>
}
