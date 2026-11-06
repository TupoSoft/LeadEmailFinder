import { CredentialRejectedError, ExtractedCredential } from './credential-authenticator'

export const BFF_SESSION_COOKIE_NAME = 'lef_session'

export class CredentialExtractor {
    constructor(private readonly sessionCookieName: string = BFF_SESSION_COOKIE_NAME) {}

    extract(headers: Record<string, string | string[] | undefined>): ExtractedCredential | undefined {
        const authorization = headers['authorization']
        if (authorization !== undefined) {
            if (typeof authorization !== 'string') {
                throw new CredentialRejectedError('Authorization must occur exactly once')
            }
            const bearer = /^Bearer ([^\s,]+)$/.exec(authorization)
            if (!bearer) {
                throw new CredentialRejectedError('Authorization is malformed')
            }
            return { scheme: 'bearer', token: bearer[1] }
        }

        const cookieHeader = headers['cookie']
        if (Array.isArray(cookieHeader)) throw new CredentialRejectedError('Cookie must occur exactly once')
        const matches =
            cookieHeader?.split(';').filter(part => part.split('=', 1)[0].trim() === this.sessionCookieName) ?? []
        if (matches.length > 1) throw new CredentialRejectedError('Session cookie is ambiguous')
        if (matches.length === 1) {
            const separator = matches[0].indexOf('=')
            if (separator === -1) return undefined
            let token: string
            try {
                token = decodeURIComponent(matches[0].slice(separator + 1).trim())
            } catch {
                return undefined
            }
            if (token) return { scheme: 'session-cookie', token }
        }

        return undefined
    }
}
