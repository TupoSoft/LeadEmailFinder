import { Resolver } from 'node:dns/promises'
import type { MxRecord } from 'node:dns'
import { getDomain } from 'tldts'

export interface DNSTypeMap {
    MX: MxRecord[]
    PTR: string[]
    A: string[]
    AAAA: string[]
}

export interface IDnsService {
    resolve<T extends keyof DNSTypeMap>(name: string, type: T, signal?: AbortSignal): Promise<DNSTypeMap[T]>
}

function isMissingRecords(error: unknown): boolean {
    return error instanceof Error && 'code' in error && (error.code === 'ENODATA' || error.code === 'ENOTFOUND')
}

async function resolveRecords<T extends keyof DNSTypeMap>(
    resolver: Resolver,
    name: string,
    type: T,
): Promise<DNSTypeMap[T]> {
    switch (type) {
        case 'MX': {
            const records = await resolver.resolveMx(name).catch((error: unknown) => {
                if (isMissingRecords(error)) {
                    return []
                }

                throw error
            })

            return records.sort((a, b) => a.priority - b.priority) as DNSTypeMap[T]
        }
        case 'PTR':
            return (await resolver.reverse(name)) as DNSTypeMap[T]
        case 'A':
            return (await resolver.resolve4(name)) as DNSTypeMap[T]
        case 'AAAA':
            return (await resolver.resolve6(name)) as DNSTypeMap[T]
    }

    throw new Error('dns_record_type_unsupported')
}

/** Each query owns its resolver: aborting one job must not cancel another job's lookups. */
export async function fetchRecords<T extends keyof DNSTypeMap>(
    name: string,
    type: T,
    signal?: AbortSignal,
): Promise<DNSTypeMap[T]> {
    signal?.throwIfAborted()

    const resolver = new Resolver({ timeout: 10_000, tries: 1 })
    const cancel = (): void => resolver.cancel()
    signal?.addEventListener('abort', cancel, { once: true })

    try {
        const records = await resolveRecords(resolver, name, type)

        signal?.throwIfAborted()

        return records
    } finally {
        signal?.removeEventListener('abort', cancel)
        resolver.cancel()
    }
}

export function fetchMxRecords(domain: string, signal?: AbortSignal): Promise<DNSTypeMap['MX']> {
    return fetchRecords(domain, 'MX', signal)
}

export function getSecondLevelDomain(domain: string): string | undefined {
    const parsed = getDomain(domain)
    return parsed ?? undefined
}
