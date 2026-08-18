export interface SessionRecord {
    readonly externalIdentityId: string
    readonly organizationId: string
    readonly issuer: string
    readonly subject: string
    readonly csrfToken: string
    readonly accessToken: string
    readonly refreshToken: string
    readonly accessTokenExpiresAt: number
    readonly refreshTokenExpiresAt: number | null
    readonly absoluteExpiresAt: number
    readonly createdAt: number
}
