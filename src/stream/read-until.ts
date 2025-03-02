import type { Readable } from 'node:stream'
import { FIRST_ARRAY_ELEMENT_INDEX } from '../common'
import { KILOBYTE } from './constants'

export async function readUntil(
    readable: Readable,
    matchPattern: RegExp | string,
    maxBufferSize = KILOBYTE,
): Promise<string> {
    return await new Promise((resolve, reject) => {
        let buffer = ''
        const pattern = typeof matchPattern === 'string' ? new RegExp(matchPattern) : matchPattern

        const cleanup = (): void => {
            readable.off('data', onData)
            readable.off('error', onError)
            readable.off('end', onEnd)
        }

        const onData = (chunk: Buffer): void => {
            buffer += chunk.toString()

            if (buffer.length > maxBufferSize) {
                cleanup()
                reject(new Error('Buffer exceeded maximum allowed size.'))
                return
            }

            const matchArray = buffer.match(pattern)

            if (matchArray !== null) {
                const [firstMatch] = matchArray

                const firstMatchLastIndex = buffer.indexOf(firstMatch)
                const matchedData = buffer.slice(FIRST_ARRAY_ELEMENT_INDEX, firstMatchLastIndex + firstMatch.length)
                const unmatchedData = buffer.slice(firstMatchLastIndex + firstMatch.length)

                cleanup()

                readable.pause()
                readable.unshift(unmatchedData)

                resolve(matchedData)
            }
        }

        const onError = (err: Error): void => {
            cleanup()
            reject(new Error(`Stream error: ${err.message}`))
        }

        const onEnd = (): void => {
            cleanup()
            resolve(buffer)
        }

        if (readable.isPaused()) {
            readable.resume()
        }

        readable.on('data', onData)
        readable.on('error', onError)
        readable.on('end', onEnd)
    })
}
