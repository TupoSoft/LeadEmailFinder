export const BATCH_INPUT = Symbol('BatchInput')

export interface BatchInputRow {
    email: string
}

export interface BatchInput {
    rows(bucket: string, key: string): AsyncIterable<BatchInputRow>
}
