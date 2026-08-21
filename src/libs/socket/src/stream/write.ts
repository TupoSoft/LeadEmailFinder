import type { Writable } from 'node:stream'
import { once } from 'node:events'

export async function write(stream: Writable, data: Buffer | string, signal?: AbortSignal): Promise<void> {
    if (stream.destroyed || stream.writableEnded) {
        throw new Error('Stream is already closed or ended.')
    }

    if (!stream.write(data)) {
        await once(stream, 'drain', { signal })
    }
}
