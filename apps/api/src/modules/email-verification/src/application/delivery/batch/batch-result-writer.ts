export const BATCH_RESULT_WRITER = Symbol('BatchResultWriter')

export interface BatchResultWriter {
    write(bucket: string, key: string, organizationId: string, batchId: string): Promise<{ resultFilePath: string }>
}
