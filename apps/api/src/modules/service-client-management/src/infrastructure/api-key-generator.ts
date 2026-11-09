import { createHash, randomBytes } from 'node:crypto'
import { ApiKeyGenerator } from '../application/ports/api-key-generator'

export const generateApiKey: ApiKeyGenerator = () => {
    const apiKey = `lef_${randomBytes(32).toString('base64url')}`
    return {
        apiKey,
        keyHash: createHash('sha256').update(apiKey).digest('hex'),
        keyPrefix: apiKey.slice(0, 12),
    }
}
