import { randomBytes } from 'node:crypto'
import { decodeSessionEncryptionKey } from './session-encryption-key'

describe('decodeSessionEncryptionKey', () => {
    it('decodes a valid 32-byte base64url key', () => {
        const rawKey = randomBytes(32).toString('base64url')

        const decoded = decodeSessionEncryptionKey(rawKey)

        expect(decoded).toHaveLength(32)
    })

    it('throws when the decoded key is too short', () => {
        const rawKey = randomBytes(16).toString('base64url')

        expect(() => decodeSessionEncryptionKey(rawKey)).toThrow(/32 bytes/)
    })

    it('throws when the decoded key is too long', () => {
        const rawKey = randomBytes(64).toString('base64url')

        expect(() => decodeSessionEncryptionKey(rawKey)).toThrow(/32 bytes/)
    })
})
