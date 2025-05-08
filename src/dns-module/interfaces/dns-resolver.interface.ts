import type { DNSTypeMap } from '../util'

export interface IDnsService {
    resolve: <T extends keyof DNSTypeMap>(name: string, type: T) => Promise<DNSTypeMap[T]>
}
