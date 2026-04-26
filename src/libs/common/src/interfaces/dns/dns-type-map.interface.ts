import type { MxRecord } from 'node:dns'

export interface DNSTypeMap {
    MX: MxRecord[]
    PTR: string[]
}
