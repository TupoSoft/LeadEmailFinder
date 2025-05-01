import { existsSync, readFileSync } from 'node:fs'

export default function (): Record<string, unknown> {
    const config: Record<string, unknown> = {}

    for (const [envKey, envVal] of Object.entries(process.env)) {
        if (!envKey.endsWith('_FILE') || !envVal) {
            continue
        }

        const keyBase = envKey.slice(0, -5)
        const filePath = envVal
        if (!existsSync(filePath)) {
            console.warn(`Secret-file loader: ${filePath} not found, skipping.`)
            continue
        }

        const raw = readFileSync(filePath, 'utf8').trim()

        if (filePath.toLowerCase().endsWith('.json')) {
            try {
                config[keyBase] = JSON.parse(raw)
            } catch (error: unknown) {
                console.error(error)
                console.warn(`Secret-file loader: failed to parse JSON from ${filePath}; using raw string.`)
                config[keyBase] = raw
            }
        } else {
            config[keyBase] = raw
        }
    }

    return config
}
