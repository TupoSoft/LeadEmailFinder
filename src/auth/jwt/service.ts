import { createHmac } from 'node:crypto'
import { parseTimeString } from '../../util/time'
import { ok } from 'node:assert'
import { base64UrlDecode, base64UrlEncode } from './util'
import { isJwtPayload } from './type-guards'

export interface JwtPayload {
    sub?: string
    iss?: string
    aud?: string
    exp?: number
    nbf?: number
    iat?: number
    jti?: string

    [key: string]: unknown
}

export interface JwtServiceConstructorOptions {
    secret: string
    issuer: string
    audience: string
}

export class JwtService {
    private readonly secret
    private readonly issuer
    private readonly audience

    constructor(options: JwtServiceConstructorOptions) {
        const { secret, issuer, audience } = options

        this.secret = secret
        this.issuer = issuer
        this.audience = audience
    }

    signJwt(payload: JwtPayload): string {
        const header = {
            alg: 'HS256',
            typ: 'JWT',
        }

        payload.iss ??= this.issuer
        payload.aud ??= this.audience
        payload.iat ??= Math.floor(Date.now() / parseTimeString('1s'))
        payload.exp ??= payload.iat + parseTimeString('1h')

        const encodedHeader = base64UrlEncode(JSON.stringify(header))
        const encodedPayload = base64UrlEncode(JSON.stringify(payload))
        const data = `${encodedHeader}.${encodedPayload}`

        const signature = createHmac('sha256', this.secret).update(data).digest('base64url')

        return `${encodedHeader}.${encodedPayload}.${signature}`
    }

    verifyJwt(token: string): JwtPayload {
        const tokenParts = token.split('.')

        const jwtTokenPartsSize = 3
        if (tokenParts.length !== jwtTokenPartsSize) {
            throw new Error('Invalid token format')
        }

        const [encodedHeader, encodedPayload, receivedSignature] = tokenParts
        const data = `${encodedHeader}.${encodedPayload}`

        const signature = createHmac('sha256', this.secret).update(data).digest('base64url')

        if (signature !== receivedSignature) {
            throw new Error('Invalid signature')
        }

        const payload: unknown = JSON.parse(base64UrlDecode(encodedPayload))
        ok(isJwtPayload(payload), new Error('Invalid payload'))

        if (payload.exp != null && payload.exp < Math.floor(Date.now() / parseTimeString('1s'))) {
            throw new Error('Token expired')
        }

        return payload
    }
}
