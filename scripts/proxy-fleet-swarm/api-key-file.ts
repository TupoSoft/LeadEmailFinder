import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

/** Read fresh material for each request, so replacing the private file needs no process restart. */
export async function readApiKeyFile(path: string): Promise<string> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
        const metadata = await file.stat()
        if (!metadata.isFile() || (metadata.mode & 0o077) !== 0 || metadata.size > 4096) {
            throw new Error('API-key file must be a private regular file (mode 0600 or stricter)')
        }
        let payload: unknown
        try {
            payload = JSON.parse(await file.readFile('utf8'))
        } catch {
            // JSON parse diagnostics can quote secret input; never propagate them.
            throw new Error('API-key file must contain valid JSON')
        }
        if (
            typeof payload !== 'object' ||
            payload === null ||
            !('apiKey' in payload) ||
            typeof payload.apiKey !== 'string' ||
            !/^lef_[A-Za-z0-9_-]{43}$/.test(payload.apiKey)
        ) {
            throw new Error('API-key file must contain a valid apiKey string')
        }
        return payload.apiKey
    } finally {
        await file.close()
    }
}
