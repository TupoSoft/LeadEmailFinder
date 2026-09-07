import { Readable } from 'node:stream'

export const BATCH_RESULT_READER = Symbol('BatchResultReader')

export interface BatchResultReader {
    read(resultFilePath: string): Promise<Readable>
}
