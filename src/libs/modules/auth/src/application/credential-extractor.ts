import { Injectable } from '@nestjs/common'
import { ExtractedCredential } from './credential-authenticator'

export function isJwtShapedToken(token: string): boolean {
    return token.split('.').length === 3
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

        return undefined
    }

    private firstValue(header: string | string[] | undefined): string | undefined {
        return Array.isArray(header) ? header[0] : header
    }
}
