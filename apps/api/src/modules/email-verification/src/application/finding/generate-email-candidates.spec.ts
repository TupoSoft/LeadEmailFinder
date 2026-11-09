import { FindingInput, FindingInputError } from '../../domain/finding-input'
import { generateEmailCandidates } from './generate-email-candidates'

describe('generateEmailCandidates', () => {
    const janeDoe = { firstName: 'Jane', lastName: 'Doe', domain: 'Example.COM.' }

    it('returns the literal version 1 Jane Doe sequence and its pattern identities', () => {
        expect(generateEmailCandidates(janeDoe)).toEqual({
            generationVersion: 1,
            normalized: { firstName: 'jane', lastName: 'doe', domain: 'example.com' },
            candidates: [
                { index: 0, email: 'jane@example.com', patterns: ['{first}'] },
                { index: 1, email: 'doe@example.com', patterns: ['{last}'] },
                { index: 2, email: 'jane.doe@example.com', patterns: ['{first}.{last}'] },
                { index: 3, email: 'jdoe@example.com', patterns: ['{f}{last}'] },
                { index: 4, email: 'j.doe@example.com', patterns: ['{f}.{last}'] },
                { index: 5, email: 'janedoe@example.com', patterns: ['{first}{last}'] },
                { index: 6, email: 'janed@example.com', patterns: ['{first}{l}'] },
                { index: 7, email: 'jane.d@example.com', patterns: ['{first}.{l}'] },
                { index: 8, email: 'doe.jane@example.com', patterns: ['{last}.{first}'] },
                { index: 9, email: 'jane_doe@example.com', patterns: ['{first}_{last}'] },
                { index: 10, email: 'doej@example.com', patterns: ['{last}{f}'] },
                { index: 11, email: 'jd@example.com', patterns: ['{f}{l}'] },
                { index: 12, email: 'djane@example.com', patterns: ['{l}{first}'] },
                { index: 13, email: 'd.jane@example.com', patterns: ['{l}.{first}'] },
                { index: 14, email: 'doejane@example.com', patterns: ['{last}{first}'] },
                { index: 15, email: 'jane-doe@example.com', patterns: ['{first}-{last}'] },
            ],
            omittedPatterns: [],
        })
    })

    it('merges every colliding pattern in template order and keeps the first candidate position', () => {
        expect(generateEmailCandidates({ firstName: 'A', lastName: 'a', domain: 'example.com' }).candidates).toEqual([
            { index: 0, email: 'a@example.com', patterns: ['{first}', '{last}'] },
            {
                index: 1,
                email: 'a.a@example.com',
                patterns: ['{first}.{last}', '{f}.{last}', '{first}.{l}', '{last}.{first}', '{l}.{first}'],
            },
            {
                index: 2,
                email: 'aa@example.com',
                patterns: [
                    '{f}{last}',
                    '{first}{last}',
                    '{first}{l}',
                    '{last}{f}',
                    '{f}{l}',
                    '{l}{first}',
                    '{last}{first}',
                ],
            },
            { index: 3, email: 'a_a@example.com', patterns: ['{first}_{last}'] },
            { index: 4, email: 'a-a@example.com', patterns: ['{first}-{last}'] },
        ])
    })

    it.each([
        { firstName: ' J A N E ', lastName: ' D O E ', domain: ' example.com ' },
        { firstName: 'Jáne', lastName: 'Doé', domain: 'EXAMPLE.com.' },
        { firstName: "Ja'ne", lastName: 'D-o’e', domain: 'example.com' },
    ])('returns identical complete reports for equivalent inputs: %j', input => {
        expect(generateEmailCandidates(input)).toEqual(generateEmailCandidates(janeDoe))
    })

    it('uses normalized spelling and the complete IDNA subdomain on every candidate', () => {
        const result = generateEmailCandidates({ firstName: 'José', lastName: 'O’Neil', domain: 'WWW.BÜCHER.DE.' })
        expect(result.normalized).toEqual({ firstName: 'jose', lastName: 'oneil', domain: 'www.xn--bcher-kva.de' })
        expect(result.candidates.map(candidate => candidate.email)).toEqual([
            'jose@www.xn--bcher-kva.de',
            'oneil@www.xn--bcher-kva.de',
            'jose.oneil@www.xn--bcher-kva.de',
            'joneil@www.xn--bcher-kva.de',
            'j.oneil@www.xn--bcher-kva.de',
            'joseoneil@www.xn--bcher-kva.de',
            'joseo@www.xn--bcher-kva.de',
            'jose.o@www.xn--bcher-kva.de',
            'oneil.jose@www.xn--bcher-kva.de',
            'jose_oneil@www.xn--bcher-kva.de',
            'oneilj@www.xn--bcher-kva.de',
            'jo@www.xn--bcher-kva.de',
            'ojose@www.xn--bcher-kva.de',
            'o.jose@www.xn--bcher-kva.de',
            'oneiljose@www.xn--bcher-kva.de',
            'jose-oneil@www.xn--bcher-kva.de',
        ])
    })

    it('accepts 64-byte name candidates and records every omitted longer template', () => {
        const firstName = 'a'.repeat(64)
        const lastName = 'b'.repeat(64)
        const result = generateEmailCandidates({ firstName, lastName, domain: 'example.com' })
        expect(result.candidates).toEqual([
            { index: 0, email: `${firstName}@example.com`, patterns: ['{first}'] },
            { index: 1, email: `${lastName}@example.com`, patterns: ['{last}'] },
            { index: 2, email: 'ab@example.com', patterns: ['{f}{l}'] },
        ])
        expect(result.omittedPatterns).toEqual([
            { pattern: '{first}.{last}', reason: 'address_too_long' },
            { pattern: '{f}{last}', reason: 'address_too_long' },
            { pattern: '{f}.{last}', reason: 'address_too_long' },
            { pattern: '{first}{last}', reason: 'address_too_long' },
            { pattern: '{first}{l}', reason: 'address_too_long' },
            { pattern: '{first}.{l}', reason: 'address_too_long' },
            { pattern: '{last}.{first}', reason: 'address_too_long' },
            { pattern: '{first}_{last}', reason: 'address_too_long' },
            { pattern: '{last}{f}', reason: 'address_too_long' },
            { pattern: '{l}{first}', reason: 'address_too_long' },
            { pattern: '{l}.{first}', reason: 'address_too_long' },
            { pattern: '{last}{first}', reason: 'address_too_long' },
            { pattern: '{first}-{last}', reason: 'address_too_long' },
        ])
    })

    it('counts template separators toward the 64-byte local-part limit', () => {
        const firstName = 'a'.repeat(31)
        const lastName = 'b'.repeat(32)
        const atLimit = generateEmailCandidates({ firstName, lastName, domain: 'example.com' })
        expect(atLimit.omittedPatterns).toEqual([])
        expect(atLimit.candidates).toContainEqual({
            index: 2,
            email: `${firstName}.${lastName}@example.com`,
            patterns: ['{first}.{last}'],
        })

        const overLimit = generateEmailCandidates({ firstName, lastName: `${lastName}b`, domain: 'example.com' })
        expect(overLimit.omittedPatterns).toEqual([
            { pattern: '{first}.{last}', reason: 'address_too_long' },
            { pattern: '{last}.{first}', reason: 'address_too_long' },
            { pattern: '{first}_{last}', reason: 'address_too_long' },
            { pattern: '{first}-{last}', reason: 'address_too_long' },
        ])
        expect(overLimit.candidates).toContainEqual({
            index: 4,
            email: `${firstName}${lastName}b@example.com`,
            patterns: ['{first}{last}'],
        })
    })

    it('accepts 254-byte addresses and omits 255-byte addresses before merging patterns', () => {
        const domain = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(59)}`
        expect(domain).toHaveLength(251)
        const result = generateEmailCandidates({ firstName: 'a', lastName: 'b', domain })
        expect(result.candidates).toEqual([
            { index: 0, email: `a@${domain}`, patterns: ['{first}'] },
            { index: 1, email: `b@${domain}`, patterns: ['{last}'] },
            { index: 2, email: `ab@${domain}`, patterns: ['{f}{last}', '{first}{last}', '{first}{l}', '{f}{l}'] },
            { index: 3, email: `ba@${domain}`, patterns: ['{last}{f}', '{l}{first}', '{last}{first}'] },
        ])
        expect(result.candidates[2].email).toHaveLength(254)
        expect(result.omittedPatterns).toEqual([
            { pattern: '{first}.{last}', reason: 'address_too_long' },
            { pattern: '{f}.{last}', reason: 'address_too_long' },
            { pattern: '{first}.{l}', reason: 'address_too_long' },
            { pattern: '{last}.{first}', reason: 'address_too_long' },
            { pattern: '{first}_{last}', reason: 'address_too_long' },
            { pattern: '{l}.{first}', reason: 'address_too_long' },
            { pattern: '{first}-{last}', reason: 'address_too_long' },
        ])
    })

    it('returns a typed input error if the valid hostname leaves no room for any candidate', () => {
        const domain = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`
        expect(domain).toHaveLength(253)
        expect(() => generateEmailCandidates({ firstName: 'a', lastName: 'b', domain })).toThrow(
            new FindingInputError('input', 'no_candidates'),
        )
        try {
            generateEmailCandidates({ firstName: 'a', lastName: 'b', domain })
        } catch (error) {
            expect(error).toMatchObject({ field: 'input', code: 'no_candidates' })
            expect(JSON.stringify(error)).not.toContain(domain)
        }
    })

    it.each([
        [{ ...janeDoe, firstName: '李' }, 'firstName', 'unsupported_characters'],
        [{ ...janeDoe, lastName: 'D0e' }, 'lastName', 'unsupported_characters'],
        [{ ...janeDoe, domain: 'example.com/path' }, 'domain', 'invalid_domain'],
        [null, 'input', 'invalid_type'],
    ])('propagates typed validation errors without a partial report: %j', (input, field, code) => {
        expect.assertions(2)
        try {
            generateEmailCandidates(input as FindingInput)
        } catch (error) {
            expect(error).toBeInstanceOf(FindingInputError)
            expect(error).toMatchObject({ field, code })
        }
    })

    it('does not mutate or retain the input and produces fresh reports on repeated calls', () => {
        const input = Object.freeze({ ...janeDoe })
        const result = generateEmailCandidates(input)
        result.normalized.firstName = 'changed'
        result.candidates[0].email = 'changed@example.org'
        result.candidates[0].patterns.length = 0
        result.candidates.length = 0
        expect(input).toEqual(janeDoe)
        expect(generateEmailCandidates(input)).toEqual(generateEmailCandidates(janeDoe))
        expect(generateEmailCandidates(input).candidates[0]).toEqual({
            index: 0,
            email: 'jane@example.com',
            patterns: ['{first}'],
        })
    })

    it.each([
        janeDoe,
        { firstName: 'a', lastName: 'a', domain: 'example.com' },
        { firstName: 'Mary-Jane', lastName: 'O’Neil', domain: 'mail.example.com' },
        { firstName: 'a'.repeat(64), lastName: 'b'.repeat(64), domain: 'bücher.de' },
    ])('keeps candidates bounded, unique, ASCII, and on the supplied canonical hostname: %j', input => {
        const result = generateEmailCandidates(input)
        expect(result.candidates.length).toBeGreaterThan(0)
        expect(result.candidates.length).toBeLessThanOrEqual(16)
        expect(new Set(result.candidates.map(candidate => candidate.email)).size).toBe(result.candidates.length)
        expect(
            result.candidates.reduce(
                (sum, candidate) => sum + candidate.patterns.length,
                result.omittedPatterns.length,
            ),
        ).toBe(16)
        result.candidates.forEach((candidate, index) => {
            expect(candidate.index).toBe(index)
            expect(candidate.email).toMatch(/^[a-z._-]+@[a-z0-9.-]+$/)
            expect(candidate.email.split('@')[1]).toBe(result.normalized.domain)
            expect(Buffer.byteLength(candidate.email.split('@')[0], 'ascii')).toBeLessThanOrEqual(64)
            expect(Buffer.byteLength(candidate.email, 'ascii')).toBeLessThanOrEqual(254)
        })
    })
})
