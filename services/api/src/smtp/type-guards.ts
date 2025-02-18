import type { CatchAllStatus } from './dto'
import { CATCH_ALL_STATUSES } from './constants'

export function isCatchAllStatus(value: string): value is CatchAllStatus {
    return (CATCH_ALL_STATUSES as readonly string[]).includes(value)
}
