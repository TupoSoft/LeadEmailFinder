import { DNSTypeMap } from './dns-type-map.interface'

export interface IDnsService {
    resolve: <T extends keyof DNSTypeMap>(name: string, type: T) => Promise<DNSTypeMap[T]>
}
