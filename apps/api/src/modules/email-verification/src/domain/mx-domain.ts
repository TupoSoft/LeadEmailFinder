import { getDomain } from 'tldts'

export function deriveMxDomain(targetExchange?: string): string | undefined {
    return getDomain(targetExchange ?? '') ?? undefined
}
