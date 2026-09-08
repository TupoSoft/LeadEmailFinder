import { Readable } from 'node:stream'

export const BATCH_RESULT_READER = Symbol('BatchResultReader')

export class BatchResultUnavailableError extends Error {
    constructor() {
        super('batch_result_unavailable')
        this.name = 'BatchResultUnavailableError'
    }
}

export interface BatchResultReader {
    read(resultFilePath: string): Promise<Readable>
}
