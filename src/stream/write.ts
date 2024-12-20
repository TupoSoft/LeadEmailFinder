import type { Writable } from 'node:stream'

export async function write(stream: Writable, data: Buffer | string): Promise<void> {
    if (stream.destroyed || stream.writableEnded) {
        throw new Error('Stream is already closed or ended.')
    }

    await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
            stream.off('error', onError)
            stream.off('drain', onDrain)
        }

        const onError = (err: Error): void => {
            cleanup()
            reject(err)
        }

        const onDrain = (): void => {
            cleanup()
            resolve()
        }

        const onWrite = (err?: Error | null): void => {
            if (err != null) {
                onError(err)
            } else {
                cleanup()
                resolve()
            }
        }

        stream.once('error', onError)
        stream.once('drain', onDrain)
        stream.write(data, onWrite)
    })
}
