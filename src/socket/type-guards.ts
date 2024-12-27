import { type NetConnectOpts, Socket } from 'node:net'
import { ok } from 'node:assert'
import type { ConnectionOptions } from 'node:tls'

export function isNetConnectOpts(value: unknown): value is NetConnectOpts {
    try {
        ok(value != null)
        ok(typeof value === 'object')

        const hasPort = 'port' in value && typeof value.port === 'number'
        const hasPath = 'path' in value && typeof value.path === 'string'

        ok(hasPort || hasPath)
    } catch (error) {
        return false
    }

    return true
}

export function isTlsConnectionOptions(value: unknown): value is ConnectionOptions {
    try {
        ok(value != null)
        ok(typeof value === 'object')

        const hasSocket = 'socket' in value && value.socket instanceof Socket

        ok(isNetConnectOpts(value) || hasSocket)
    } catch (error) {
        return false
    }

    return true
}

export function isString(value: unknown): value is string {
    return typeof value === 'string'
}

export function isStringOrUndefined(value: unknown): value is string | undefined {
    return isString(value) || typeof value === 'string'
}
