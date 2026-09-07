import { createHmac } from 'node:crypto'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function decodeBase32(value: unknown): Buffer {
    if (
        typeof value !== 'string' ||
        value.length < 2 ||
        value.length > 1024 ||
        /[^A-Z2-7]/.test(value) ||
        ![0, 2, 4, 5, 7].includes(value.length % 8)
    ) {
        throw new Error('Invalid browser fixture TOTP configuration.')
    }

    const bytes: number[] = []
    let buffer = 0
    let bits = 0
    for (const character of value) {
        buffer = (buffer << 5) | alphabet.indexOf(character)
        bits += 5
        if (bits >= 8) {
            bits -= 8
            bytes.push((buffer >>> bits) & 0xff)
            buffer &= (1 << bits) - 1
        }
    }
    if (buffer !== 0) throw new Error('Invalid browser fixture TOTP configuration.')
    return Buffer.from(bytes)
}

export function assertTotpSecret(value: unknown): asserts value is string {
    decodeBase32(value)
}

/** Test-process-only RFC 6238 TOTP: SHA-1, six digits, thirty-second steps. */
export function generateTotp(secret: string, nowMilliseconds: number): string {
    if (!Number.isSafeInteger(nowMilliseconds) || nowMilliseconds < 0) {
        throw new Error('Invalid browser fixture TOTP clock.')
    }
    const key = decodeBase32(secret)
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(Math.floor(nowMilliseconds / 30_000)))
    const digest = createHmac('sha1', key).update(counter).digest()
    const offset = digest[digest.length - 1] & 0x0f
    const truncated = digest.readUInt32BE(offset) & 0x7fffffff
    return (truncated % 1_000_000).toString().padStart(6, '0')
}
