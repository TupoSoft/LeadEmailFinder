import { CredentialRejectedError, ExtractedCredential } from './credential-authenticator'

export const BFF_SESSION_COOKIE_NAME = 'lef_session'

function parseCookieHeader(header: string | undefined): Record<string, string> {
    if (!header) {
        return {}
    }

    return Object.fromEntries(
        header
            .split(';')
            .flatMap((part): [string, string][] => {
                const separatorIndex = part.indexOf('=')
                const name = (separatorIndex === -1 ? part : part.slice(0, separatorIndex)).trim()
                const encodedValue = separatorIndex === -1 ? '' : part.slice(separatorIndex + 1).trim()

                try {
                    return [[name, decodeURIComponent(encodedValue)]]
                } catch (error) {
                    if (error instanceof URIError) {
                        return []
                    }

                    throw error
                }
            })
            .filter(([name]) => name.length > 0),
    )
}

export class CredentialExtractor {
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

        const sessionId = parseCookieHeader(this.firstValue(headers['cookie']))[BFF_SESSION_COOKIE_NAME]

        if (sessionId) {
            return { scheme: 'session-cookie', token: sessionId }
        }

        return undefined
    }

    private firstValue(header: string | string[] | undefined): string | undefined {
        return Array.isArray(header) ? header[0] : header
    }
}
