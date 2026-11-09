import { EmailPatternEnum } from '@tuposoft/lead-email-finder/common/enums/email/email-pattern.enum'
import { EmailCandidate, FindingInput, FindingInputError, GeneratedEmailCandidates } from '../../domain/finding-input'
import { normalizeFindingInput } from './normalize-finding-input'

// A persisted generation version must retain this order even when the shared enum grows.
const VERSION_1_PATTERNS = [
    EmailPatternEnum.First,
    EmailPatternEnum.Last,
    EmailPatternEnum.FirstLast,
    EmailPatternEnum.FLast,
    EmailPatternEnum.FDotLast,
    EmailPatternEnum.FirstLastNoSeparator,
    EmailPatternEnum.FirstL,
    EmailPatternEnum.FirstDotL,
    EmailPatternEnum.LastFirst,
    EmailPatternEnum.FirstUnderscoreLast,
    EmailPatternEnum.LastF,
    EmailPatternEnum.FL,
    EmailPatternEnum.LFirst,
    EmailPatternEnum.LDotFirst,
    EmailPatternEnum.LastFirstNoSeparator,
    EmailPatternEnum.FirstHyphenLast,
] as const

export function generateEmailCandidates(input: FindingInput): GeneratedEmailCandidates {
    const normalized = normalizeFindingInput(input)
    const { firstName, lastName, domain } = normalized
    const candidates: EmailCandidate[] = []
    const byAddress = new Map<string, EmailCandidate>()
    const omittedPatterns: GeneratedEmailCandidates['omittedPatterns'] = []

    for (const pattern of VERSION_1_PATTERNS) {
        const localPart = pattern
            .replace('{first}', firstName)
            .replace('{last}', lastName)
            .replace('{f}', firstName[0])
            .replace('{l}', lastName[0])
        const email = `${localPart}@${domain}`
        // Normalization guarantees ASCII, so string lengths are also byte lengths.
        if (localPart.length > 64 || email.length > 254) {
            omittedPatterns.push({ pattern, reason: 'address_too_long' })
            continue
        }

        const existing = byAddress.get(email)
        if (existing) {
            existing.patterns.push(pattern)
        } else {
            const candidate = { index: candidates.length, email, patterns: [pattern] }
            candidates.push(candidate)
            byAddress.set(email, candidate)
        }
    }

    if (candidates.length === 0) throw new FindingInputError('input', 'no_candidates')
    return { generationVersion: 1, normalized, candidates, omittedPatterns }
}
