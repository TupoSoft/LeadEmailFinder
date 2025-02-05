import { createHmac, randomUUID } from 'node:crypto'
import { parseTimeString } from '../../util/time'
import { ok } from 'node:assert'
import { base64UrlDecode, base64UrlEncode } from './util'
import { isJwtPayload } from './type-guards'
import { REFRESH_TOKEN_LENGTH } from '../constants'
import { RefreshData } from '../dto'

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
    expiration: string
    refreshExpiration: string
}

export class JwtService {
    private readonly secret
    private readonly issuer
    private readonly audience
    private readonly expiration
    private readonly refreshExpiration

    constructor(options: JwtServiceConstructorOptions) {
        const { secret, issuer, audience, expiration, refreshExpiration } = options

        this.secret = secret
        this.issuer = issuer
        this.audience = audience
        this.expiration = expiration
        this.refreshExpiration = refreshExpiration
    }

    private signJwt(payload: JwtPayload, expiresIn: string): string {
        const header = {
            alg: 'HS256',
            typ: 'JWT',
        }

        payload.iss ??= this.issuer
        payload.aud ??= this.audience
        payload.iat ??= Math.floor(Date.now() / parseTimeString('1s'))
        payload.exp ??= payload.iat + parseTimeString(expiresIn) / parseTimeString('1s')

        const encodedHeader = base64UrlEncode(JSON.stringify(header))
        const encodedPayload = base64UrlEncode(JSON.stringify(payload))
        const data = `${encodedHeader}.${encodedPayload}`

        const signature = createHmac('sha256', this.secret).update(data).digest('base64url')

        return `${encodedHeader}.${encodedPayload}.${signature}`
    }

    signAccessToken(payload: JwtPayload): string {
        return this.signJwt(payload, this.expiration)
    }

    signRefreshToken(payload: JwtPayload): string {
        payload.jti = randomUUID()
        return this.signJwt(payload, this.refreshExpiration)
    }

    verifyJwt(token: string): JwtPayload {
        const tokenParts = token.split('.')

        if (tokenParts.length !== REFRESH_TOKEN_LENGTH) {
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

    refreshAccessToken(refreshData: RefreshData): string {
        const payload = this.verifyJwt(refreshData.token)

        const { jti, exp, iat, ...accessTokenPayload } = payload

        return this.signAccessToken(accessTokenPayload)
    }
}
