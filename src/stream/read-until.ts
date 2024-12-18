import type { Readable } from 'node:stream'
import { FIRST_ARRAY_ELEMENT_INDEX } from '../common/constants'

export async function readUntil(readable: Readable, matchPattern: RegExp | string): Promise<string> {
    return await new Promise((resolve, reject) => {
        let buffer = ''
        const pattern = typeof matchPattern === 'string' ? new RegExp(matchPattern) : matchPattern

        const onData = (chunk: Buffer): void => {
            buffer += chunk.toString()
            const matchArray = buffer.match(pattern)

            if (matchArray !== null) {
                const [firstMatch] = matchArray

                const firstMatchLastIndex = buffer.indexOf(firstMatch)
                const matchedData = buffer.slice(FIRST_ARRAY_ELEMENT_INDEX, firstMatchLastIndex + firstMatch.length)
                const unmatchedData = buffer.slice(firstMatchLastIndex + firstMatch.length)

                readable.off('data', onData)
                readable.off('error', onError)

                readable.unshift(unmatchedData)

                resolve(matchedData)
            }
        }

        const onError = (err: Error): void => {
            readable.off('data', onData)
            readable.off('error', onError)
            reject(err)
        }

        readable.on('data', onData)
        readable.on('error', onError)
    })
}
