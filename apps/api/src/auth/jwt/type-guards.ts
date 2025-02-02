import { ok } from 'node:assert'
import { ZERO } from '../../common'
import { parseTimeString } from '../../util/time'
import type { JwtPayload } from './service'

export function isJwtPayload(obj: unknown): obj is JwtPayload {
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
