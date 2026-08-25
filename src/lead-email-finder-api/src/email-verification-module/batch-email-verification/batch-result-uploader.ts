import { Readable } from 'node:stream'

export const BATCH_RESULT_UPLOADER = Symbol('BatchResultUploader')

export interface BatchResultUpload {
    done(): Promise<unknown>
    abort(): Promise<void>
}

export interface BatchResultUploader {
    startCsvUpload(input: { bucket: string; key: string; body: Readable }): BatchResultUpload
}
