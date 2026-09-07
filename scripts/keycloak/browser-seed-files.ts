import { randomUUID } from 'node:crypto'
import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { BrowserSeedMetadata } from './browser-fixture-seed'

export async function readPreviousFixture<T>(filePath: string): Promise<T | undefined> {
    try {
        const entry = await lstat(filePath)
        if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Fixture metadata must be a regular local file.')
        return JSON.parse(await readFile(filePath, 'utf8')) as T
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
    }
}

export async function writeBrowserSeedMetadata(filePath: string, metadata: BrowserSeedMetadata): Promise<void> {
    // This file contains subjects and a reset fingerprint only; enrollment secrets live in a separate file.
    await readPreviousFixture(filePath)
    const temporary = join(dirname(filePath), `.browser-seed-${randomUUID()}.tmp`)
    try {
        await writeFile(temporary, `${JSON.stringify(metadata, undefined, 2)}\n`, { mode: 0o600, flag: 'wx' })
        await rename(temporary, filePath)
    } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error
        })
    }
}
