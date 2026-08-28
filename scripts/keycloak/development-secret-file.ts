import { chmod, mkdir, rmdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

async function removeEmptyDirectoryAtFilePath(filePath: string): Promise<void> {
    try {
        await rmdir(filePath)
    } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT' || code === 'ENOTDIR') {
            return
        }
        throw error
    }
}

export async function writeDevelopmentSecretFile(filePath: string, contents: string, mode: number): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })

    // Docker Compose's short bind-mount syntax historically created an empty directory when this generated
    // file was absent. Remove only that empty artifact; rmdir deliberately refuses to delete non-empty data.
    await removeEmptyDirectoryAtFilePath(filePath)

    await writeFile(filePath, contents, { mode })
    await chmod(filePath, mode)
}
