import { randomBytes } from 'node:crypto'
import { SessionRecord } from '../../domain/session-record'
import { SessionEncryptor } from './session-encryptor'

function sampleRecord(): SessionRecord {
    return {
        externalIdentityId: 'identity-1',
        organizationId: 'org-1',
        issuer: 'https://issuer',
        subject: 'subject-1',
        csrfToken: 'csrf-token',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshTokenExpiresAt: Date.now() + 120_000,
        absoluteExpiresAt: Date.now() + 86_400_000,
        createdAt: Date.now(),
    }
}

describe('SessionEncryptor', () => {
    it('round-trips a session record through encryption and decryption', async () => {
        const encryptor = new SessionEncryptor(randomBytes(32).toString('base64url'))
        const record = sampleRecord()

        const ciphertext = await encryptor.encrypt(record)
        const decrypted = await encryptor.decrypt(ciphertext)

        expect(decrypted).toMatchObject(record)
    })

    it('returns undefined when the ciphertext is tampered with', async () => {
        const encryptor = new SessionEncryptor(randomBytes(32).toString('base64url'))
        const ciphertext = await encryptor.encrypt(sampleRecord())
        const [header, encryptedKey, iv, encryptedPayload, tag] = ciphertext.split('.')
        const tamperedPayload = Buffer.from(encryptedPayload, 'base64url')
        tamperedPayload[0] ^= 1

        const tampered = [header, encryptedKey, iv, tamperedPayload.toString('base64url'), tag].join('.')

        expect(tampered).not.toBe(ciphertext)
        await expect(encryptor.decrypt(tampered)).resolves.toBeUndefined()
    })

    it('returns undefined when decrypting with the wrong key', async () => {
        const encryptor = new SessionEncryptor(randomBytes(32).toString('base64url'))
        const otherEncryptor = new SessionEncryptor(randomBytes(32).toString('base64url'))
        const ciphertext = await encryptor.encrypt(sampleRecord())

        await expect(otherEncryptor.decrypt(ciphertext)).resolves.toBeUndefined()
    })

    it('returns undefined for a malformed ciphertext', async () => {
        const encryptor = new SessionEncryptor(randomBytes(32).toString('base64url'))

        await expect(encryptor.decrypt('not-a-jwe')).resolves.toBeUndefined()
    })

    it('throws at construction when the key is not 32 bytes', () => {
        expect(() => new SessionEncryptor(randomBytes(16).toString('base64url'))).toThrow(/32 bytes/)
    })
})
