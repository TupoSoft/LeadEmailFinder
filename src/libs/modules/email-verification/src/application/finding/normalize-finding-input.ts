import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import { FindingInput, FindingInputError } from '../../domain/finding-input'

function normalizeName(value: unknown, field: 'firstName' | 'lastName'): string {
    if (typeof value !== 'string') throw new FindingInputError(field, 'invalid_type')
    if (value.length > 200 || [...value].length > 100) throw new FindingInputError(field, 'too_long')
    if (/\p{Cc}/u.test(value)) throw new FindingInputError(field, 'control_characters')

    const name = value.trim()
    // Reject symbols and unlisted punctuation before compatibility normalization can disguise them.
    if (/[^\p{L}\p{M}\p{Zs}'’-]/u.test(name)) throw new FindingInputError(field, 'unsupported_characters')
    const token = name
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[\p{M}\p{Zs}'’-]/gu, '')
    if (token.length === 0) throw new FindingInputError(field, 'required')
    if (token.length > 64) throw new FindingInputError(field, 'too_long')
    if (!/^[a-z]+$/.test(token)) throw new FindingInputError(field, 'unsupported_characters')
    return token
}

function normalizeDomain(value: unknown): string {
    if (typeof value !== 'string') throw new FindingInputError('domain', 'invalid_type')
    if (value.length > 253) throw new FindingInputError('domain', 'too_long')
    if (/\p{Cc}/u.test(value)) throw new FindingInputError('domain', 'control_characters')

    const hostname = value.trim().replace(/\.$/, '')
    if (value.trim().length === 0) throw new FindingInputError('domain', 'required')
    // Node's hostname conversion also accepts URL escapes; reject URL syntax before conversion.
    if (/[\s/\\@:[\]*?#%]/u.test(hostname)) throw new FindingInputError('domain', 'invalid_domain')

    const domain = domainToASCII(hostname).toLowerCase()
    if (domain.length > 253) throw new FindingInputError('domain', 'too_long')
    const labels = domain.split('.')
    if (
        labels.length < 2 ||
        isIP(domain) !== 0 ||
        /^\d+$/.test(labels[labels.length - 1]) ||
        labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    ) {
        throw new FindingInputError('domain', 'invalid_domain')
    }
    return domain
}

/** Version 1 normalization: spelling heuristics and hostname syntax, with no external lookups. */
export function normalizeFindingInput(input: FindingInput): FindingInput {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new FindingInputError('input', 'invalid_type')
    }
    return {
        firstName: normalizeName(input.firstName, 'firstName'),
        lastName: normalizeName(input.lastName, 'lastName'),
        domain: normalizeDomain(input.domain),
    }
}
