import type { Writable } from 'node:stream'

export async function write(stream: Writable, data: Buffer | string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        if (!stream.write(data)) {
            stream.once('drain', (err?: Error) => {
                if (err !== undefined) {
                    reject(err)
                }

                resolve()
            })
        } else {
            resolve()
        }
    })
}
