import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import { JWT_AUDIENCE, JWT_HS256_SECRET, JWT_ISSUER } from '../../common/env'
import { parseTimeString } from '../../util/time'
import { ok } from 'node:assert'
import { ZERO } from '../../common/constants'

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

function isJwtPayload(obj: unknown): obj is JwtPayload {
    try {
        ok(obj !== null)
        ok(typeof obj === 'object')
        ok(Object.keys(obj).length > ZERO)
    } catch (e) {
        return false
    }

    const jwtPayload: JwtPayload = {
        sub: '',
        iss: '',
        aud: '',
        exp: parseTimeString('1s'),
        nbf: parseTimeString('0s'),
        iat: parseTimeString('0s'),
        jti: '',
    }

    for (const key of Object.keys(jwtPayload)) {
        if (key in obj) {
            return true
        }
    }

    return false
}

function base64UrlEncode(input: string): string {
    return Buffer.from(input).toString('base64url')
}

function base64UrlDecode(input: string): string {
    return Buffer.from(input, 'base64url').toString('utf8')
}

export function signJwt(payload: JwtPayload): string {
    const header = {
        alg: 'HS256',
        typ: 'JWT',
    }

    payload.iss ??= JWT_ISSUER
    payload.aud ??= JWT_AUDIENCE
    payload.iat ??= Math.floor(Date.now() / parseTimeString('1s'))
    payload.exp ??= payload.iat + parseTimeString('1h')

    const encodedHeader = base64UrlEncode(JSON.stringify(header))
    const encodedPayload = base64UrlEncode(JSON.stringify(payload))
    const data = `${encodedHeader}.${encodedPayload}`

    const signature = createHmac('sha256', JWT_HS256_SECRET).update(data).digest('base64url')

    return `${encodedHeader}.${encodedPayload}.${signature}`
}

export function verifyJwt(token: string): JwtPayload {
    const tokenParts = token.split('.')

    const jwtTokenPartsSize = 3
    if (tokenParts.length !== jwtTokenPartsSize) {
        throw new Error('Invalid token format')
    }

    const [encodedHeader, encodedPayload, receivedSignature] = tokenParts
    const data = `${encodedHeader}.${encodedPayload}`

    const signature = base64UrlEncode(createHmac('sha256', JWT_HS256_SECRET).update(data).digest('base64'))

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
