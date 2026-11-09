const SESSION_ENCRYPTION_KEY_BYTES = 32

export function decodeSessionEncryptionKey(rawKey: string): Uint8Array {
    const decoded = Buffer.from(rawKey, 'base64url')

    if (decoded.length !== SESSION_ENCRYPTION_KEY_BYTES) {
        throw new Error(
            `SESSION_ENCRYPTION_KEY must decode to exactly ${SESSION_ENCRYPTION_KEY_BYTES} bytes, got ${decoded.length}`,
        )
    }

    return decoded
}
