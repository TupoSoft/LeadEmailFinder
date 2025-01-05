import { Buffer } from 'node:buffer'

export function base64UrlEncode(input: string): string {
    return Buffer.from(input).toString('base64url')
}

export function base64UrlDecode(input: string): string {
    return Buffer.from(input, 'base64url').toString('utf8')
}
