import { createHash } from 'node:crypto'
import { generateApiKey } from './api-key-generator'

describe('API key generation', () => {
    it('generates independent 256-bit keys, hashes the complete key, and exposes only a safe prefix', () => {
        const first = generateApiKey()
        const second = generateApiKey()
        expect(first.apiKey).toMatch(/^lef_[A-Za-z0-9_-]{43}$/)
        expect(first.apiKey).toHaveLength(47)
        expect(second.apiKey).not.toBe(first.apiKey)
        expect(first.keyHash).toBe(createHash('sha256').update(first.apiKey).digest('hex'))
        expect(first.keyHash).toMatch(/^[a-f0-9]{64}$/)
        expect(first.keyPrefix).toBe(first.apiKey.slice(0, 12))
    })
})
