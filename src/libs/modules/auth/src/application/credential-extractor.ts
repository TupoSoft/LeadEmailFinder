import { Injectable } from '@nestjs/common'
import { ExtractedCredential } from './credential-authenticator'

export const BFF_SESSION_COOKIE_NAME = 'lef_session'

export function isJwtShapedToken(token: string): boolean {
    return token.split('.').length === 3
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
    if (!header) {
        return {}
    }

    return Object.fromEntries(
        header
            .split(';')
            .map((part): [string, string] => {
                const separatorIndex = part.indexOf('=')
                return separatorIndex === -1
                    ? [part.trim(), '']
                    : [part.slice(0, separatorIndex).trim(), decodeURIComponent(part.slice(separatorIndex + 1).trim())]
            })
            .filter(([name]) => name.length > 0),
    )
}

@Injectable()
export class CredentialExtractor {
    extract(headers: Record<string, string | string[] | undefined>): ExtractedCredential | undefined {
        const authorization = this.firstValue(headers['authorization'])
        const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined

        if (bearerToken) {
            return { scheme: 'bearer', token: bearerToken }
        }

        const apiKey = this.firstValue(headers['x-api-key'])

        if (apiKey) {
            return { scheme: 'x-api-key', token: apiKey }
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
