import type { NetConnectOpts } from 'node:net'
import type { ConnectionOptions } from 'node:tls'
import { connectionOptionsValidationSchema, netConnectOptsValidationSchema } from './validation'

export function isNetConnectOpts(value: unknown): value is NetConnectOpts {
    return netConnectOptsValidationSchema.safeParse(value).success
}

export function isConnectionOptions(value: unknown): value is ConnectionOptions {
    return connectionOptionsValidationSchema.safeParse(value).success
}

export function isString(value: unknown): value is string {
    return typeof value === 'string'
}

export function isStringOrUndefined(value: unknown): value is string | undefined {
    return typeof value === 'undefined' || isString(value)
}
