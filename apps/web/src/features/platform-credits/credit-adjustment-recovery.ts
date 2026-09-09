export const creditAdjustmentStoragePrefix = 'lef-platform-credit-adjustment:'
export const creditAdjustmentRecoveryWindowMs = 24 * 60 * 60 * 1000

export interface CreditAdjustmentRecord {
    version: 1
    membershipId: string
    organizationId: string
    amount: number
    key: string
    state: 'pending' | 'unknown' | 'conflict'
    createdAt: number
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const fields = ['version', 'membershipId', 'organizationId', 'amount', 'key', 'state', 'createdAt']

function isRecord(value: unknown): value is CreditAdjustmentRecord {
    if (typeof value !== 'object' || value === null) return false
    const record = value as Record<string, unknown>
    return (
        Object.keys(record).length === fields.length &&
        fields.every(field => Object.hasOwn(record, field)) &&
        record.version === 1 &&
        typeof record.membershipId === 'string' &&
        uuid.test(record.membershipId) &&
        typeof record.organizationId === 'string' &&
        uuid.test(record.organizationId) &&
        typeof record.key === 'string' &&
        uuid.test(record.key) &&
        record.key === record.key.toLowerCase() &&
        typeof record.amount === 'number' &&
        Number.isInteger(record.amount) &&
        record.amount > 0 &&
        record.amount <= 2147483647 &&
        (record.state === 'pending' || record.state === 'unknown' || record.state === 'conflict') &&
        typeof record.createdAt === 'number' &&
        Number.isSafeInteger(record.createdAt) &&
        record.createdAt > 0 &&
        record.createdAt <= Date.now()
    )
}

function readStored(storage: Storage, storageKey: string): CreditAdjustmentRecord | null {
    try {
        const raw = storage.getItem(storageKey)
        if (raw === null) return null
        const parsed: unknown = JSON.parse(raw)
        if (isRecord(parsed)) return parsed
    } catch {
        // Malformed records and unavailable storage carry no trusted recovery information.
    }
    storage.removeItem(storageKey)
    return null
}

function storageKeys(storage: Storage): string[] {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key?.startsWith(creditAdjustmentStoragePrefix)) keys.push(key)
    }
    return keys
}

/** Called only after identity is confirmed, or with no principal at an authentication boundary. */
export function reconcileCreditAdjustments(membershipId?: string): void {
    try {
        const storage = sessionStorage
        for (const storageKey of storageKeys(storage)) {
            if (storageKey !== `${creditAdjustmentStoragePrefix}${membershipId}`) {
                storage.removeItem(storageKey)
                continue
            }
            const record = readStored(storage, storageKey)
            if (record && record.membershipId !== membershipId) storage.removeItem(storageKey)
        }
    } catch {
        // Authentication cleanup must still finish if the browser denies storage access.
    }
}

/** A matching, expired record is retained until the operator acknowledges its unknown outcome. */
export function readCreditAdjustment(membershipId: string, organizationId: string): CreditAdjustmentRecord | null {
    try {
        reconcileCreditAdjustments(membershipId)
        const storageKey = `${creditAdjustmentStoragePrefix}${membershipId}`
        const record = readStored(sessionStorage, storageKey)
        if (record && record.organizationId !== organizationId) {
            sessionStorage.removeItem(storageKey)
            return null
        }
        return record
    } catch {
        return null
    }
}

/** A new adjustment is permitted only after synchronous, verified persistence. Never replace another key. */
export function saveCreditAdjustment(record: CreditAdjustmentRecord): boolean {
    if (!isRecord(record)) return false
    try {
        const storage = sessionStorage
        const storageKey = `${creditAdjustmentStoragePrefix}${record.membershipId}`
        for (const existingKey of storageKeys(storage)) {
            const existing = readStored(storage, existingKey)
            if (
                existing &&
                (existingKey !== storageKey ||
                    existing.key !== record.key ||
                    existing.organizationId !== record.organizationId ||
                    existing.amount !== record.amount ||
                    existing.createdAt !== record.createdAt ||
                    existing.membershipId !== record.membershipId)
            )
                return false
        }
        const serialized = JSON.stringify(record)
        storage.setItem(storageKey, serialized)
        return storage.getItem(storageKey) === serialized
    } catch {
        return false
    }
}

export function clearCreditAdjustment(membershipId: string): boolean {
    try {
        const storageKey = `${creditAdjustmentStoragePrefix}${membershipId}`
        sessionStorage.removeItem(storageKey)
        return sessionStorage.getItem(storageKey) === null
    } catch {
        return false
    }
}

export function isCreditAdjustmentExpired(record: CreditAdjustmentRecord, now = Date.now()): boolean {
    return now - record.createdAt >= creditAdjustmentRecoveryWindowMs
}
