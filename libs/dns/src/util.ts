import { resolveMx, reverse } from 'node:dns/promises'
import type { MxRecord } from 'node:dns'
import { getDomain } from 'tldts'
import { DNSTypeMap } from '../../../apps/lead-email-finder-api/src/common'

async function tryResolveMx(domain: string): Promise<MxRecord[]> {
    try {
        return await resolveMx(domain)
    } catch {
        return []
    }
}

export async function fetchMxRecords(domain: string): Promise<DNSTypeMap['MX']> {
    const records = await tryResolveMx(domain)
    return records.sort((a, b) => a.priority - b.priority)
}

export async function fetchRecords<T extends keyof DNSTypeMap>(name: string, type: T): Promise<DNSTypeMap[T]> {
    type ResolveFunctionType = (name: string) => Promise<DNSTypeMap[keyof DNSTypeMap]>

    const recordTypeToFunctionMap: Record<keyof DNSTypeMap, ResolveFunctionType> = {
        MX: fetchMxRecords,
        PTR: reverse,
    }

    return (await recordTypeToFunctionMap[type](name)) as DNSTypeMap[T]
}

export function getSecondLevelDomain(domain: string): string | undefined {
    const parsed = getDomain(domain)
    return parsed ?? undefined
}
