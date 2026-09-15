export const BATCH_ROW_STORE = Symbol('BatchRowStore')

export interface BatchRowRecord {
    readonly batchId: string
    readonly sourceRow: number
    readonly originalEmail: string
    readonly normalizedAddress: string
}

/** The ordered, duplicate-preserving registry of one batch upload's original input rows. Every valid CSV data row
 *  gets exactly one row here, keyed by its one-based position — this is what lets the output CSV reproduce every
 *  original row (including duplicates) after admission has deduplicated addresses for billing. */
export interface BatchRowStore {
    /** Idempotent: a row already recorded at that `(batchId, sourceRow)` is left untouched. */
    insertMany(organizationId: string, rows: readonly BatchRowRecord[]): Promise<void>

    /** Ordered by `sourceRow` ascending, paged. */
    pageBySourceRow(
        batchId: string,
        organizationId: string,
        skip: number,
        take: number,
    ): Promise<readonly BatchRowRecord[]>

    countRows(batchId: string, organizationId: string): Promise<number>
}
