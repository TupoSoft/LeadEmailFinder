import { compare, hash } from './password'
import { describe, expect, it } from '@jest/globals' // Adjust the import path as needed

describe('Password Utilities', () => {
    describe('hash', () => {
        it('should generate a valid salted hash for a password', async () => {
            const password = 'securePassword123!'
            const saltedHash = await hash(password)

            // Ensure the result contains the salt and hash separated by a colon
            expect(saltedHash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/)

            const [salt, hashPart] = saltedHash.split(':')
            expect(Buffer.from(salt, 'hex')).toHaveLength(16) // 16 bytes of salt
            expect(Buffer.from(hashPart, 'hex')).toHaveLength(64) // 64 bytes of hash
        })

        it('should throw an error if password is empty', async () => {
            await expect(hash('')).rejects.toThrow('Password must be a non-empty string')
        })
    })

    describe('compare', () => {
        it('should return true for matching password and salted hash', async () => {
            const password = 'securePassword123!'
            const saltedHash = await hash(password)

            const isMatch = await compare(password, saltedHash)
            expect(isMatch).toBe(true)
        })

        it('should return false for a non-matching password', async () => {
            const password = 'securePassword123!'
            const wrongPassword = 'wrongPassword!'
            const saltedHash = await hash(password)

            const isMatch = await compare(wrongPassword, saltedHash)
            expect(isMatch).toBe(false)
        })

        it('should throw an error if salted hash is improperly formatted', async () => {
            const password = 'securePassword123!'
            const invalidSaltedHash = 'invalidHashFormat'

            await expect(compare(password, invalidSaltedHash)).rejects.toThrow('Invalid salted hash format')
        })

        it('should throw an error if password is empty', async () => {
            const saltedHash = await hash('securePassword123!')
            await expect(compare('', saltedHash)).rejects.toThrow('Password must be a non-empty string')
        })
    })
})
