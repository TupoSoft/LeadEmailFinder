import { ProxyRecord } from '../domain/proxy-record'
import { ProxyDto, ProxyListDto } from './proxy.dto'

export function toProxyDto(record: ProxyRecord): ProxyDto {
    const dto = new ProxyDto()
    dto.id = record.id
    dto.protocol = record.protocol
    dto.host = record.host
    dto.port = record.port
    dto.state = record.state
    dto.weight = record.weight
    dto.maxConcurrent = record.maxConcurrent
    dto.requestsPerMinute = record.requestsPerMinute
    dto.description = record.description
    dto.createdAt = record.createdAt
    dto.updatedAt = record.updatedAt
    return dto
}

export function toProxyListDto(records: readonly ProxyRecord[], nextPageToken: string): ProxyListDto {
    const dto = new ProxyListDto()
    dto.proxies = records.map(toProxyDto)
    dto.nextPageToken = nextPageToken
    return dto
}
