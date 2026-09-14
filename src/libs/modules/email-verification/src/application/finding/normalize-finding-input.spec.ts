import { FindingInput, FindingInputError } from '../../domain/finding-input'
import { normalizeFindingInput } from './normalize-finding-input'

const validInput: FindingInput = { firstName: 'Jane', lastName: 'Doe', domain: 'example.com' }

function validationError(input: unknown): FindingInputError {
    try {
        normalizeFindingInput(input as FindingInput)
    } catch (error) {
        expect(error).toBeInstanceOf(FindingInputError)
        return error as FindingInputError
    }

    throw new Error('Expected finding input validation to fail')
}

describe('normalizeFindingInput', () => {
    it.each([
        ['ordinary names', 'Jane', 'Doe', 'jane', 'doe'],
        ['uppercase and surrounding spaces', '  JANE  ', '  DOE  ', 'jane', 'doe'],
        ['composed and decomposed accents', 'José', 'Jose\u0301', 'jose', 'jose'],
        ['apostrophes and a hyphen', 'Mary-Jane', "O'Neil", 'maryjane', 'oneil'],
        ['right single quotation mark', 'ÉLODIE', 'O’NEIL', 'elodie', 'oneil'],
        ['Unicode space separators', 'Mary\u00a0Jane', 'Van\u2009Der\u3000Meer', 'maryjane', 'vandermeer'],
        ['compatibility characters', 'Ｊａｎｅ', 'Oﬃce', 'jane', 'office'],
    ])('normalizes %s', (_description, firstName, lastName, expectedFirstName, expectedLastName) => {
        expect(normalizeFindingInput({ firstName, lastName, domain: 'Example.COM.' })).toEqual({
            firstName: expectedFirstName,
            lastName: expectedLastName,
            domain: 'example.com',
        })
    })

    it('returns a new normalized value without mutating the supplied object', () => {
        const input = Object.freeze({ firstName: ' José ', lastName: 'O’Neil', domain: 'WWW.Example.COM.' })

        const result = normalizeFindingInput(input)

        expect(result).toEqual({ firstName: 'jose', lastName: 'oneil', domain: 'www.example.com' })
        expect(result).not.toBe(input)
        expect(input).toEqual({ firstName: ' José ', lastName: 'O’Neil', domain: 'WWW.Example.COM.' })
        expect(normalizeFindingInput(result)).toEqual(result)
    })

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['a string', 'Jane Doe'],
        ['a number', 42],
        ['a boolean', true],
        ['a function', () => validInput],
        ['an array', []],
        ['an array with named fields', Object.assign([], validInput)],
    ])('rejects %s as the top-level input', (_description, input) => {
        expect(validationError(input)).toMatchObject({ field: 'input', code: 'invalid_type' })
    })

    describe.each(['firstName', 'lastName'] as const)('%s validation', field => {
        it.each([
            ['null', null],
            ['undefined', undefined],
            ['a number', 42],
            ['a boolean', true],
            ['an array', ['Jane']],
            ['an object', { name: 'Jane' }],
            ['a boxed string', new String('Jane')],
            ['a symbol', Symbol('Jane')],
        ])('rejects %s without coercion', (_description, value) => {
            expect(validationError({ ...validInput, [field]: value })).toMatchObject({ field, code: 'invalid_type' })
        })

        it.each(['', '   ', '\u00a0\u2009\u3000', "'-’", '\u0301\u0308'])('rejects an empty token from %j', value => {
            expect(validationError({ ...validInput, [field]: value })).toMatchObject({ field, code: 'required' })
        })

        it.each(['\tJane', 'Jane\n', 'Jane\r', 'Ja\0ne', 'Ja\u007fne', 'Ja\u0085ne'])(
            'rejects control characters before trimming %j',
            value => {
                expect(validationError({ ...validInput, [field]: value })).toMatchObject({
                    field,
                    code: 'control_characters',
                })
            },
        )

        it.each([
            'Иван',
            'Δήμητρα',
            '李',
            'Straße',
            'Søren',
            'Jane2',
            'Jane.Doe',
            'Jane_Doe',
            'Jane–Doe',
            'Jane‘Doe',
            'Jane/Doe',
            'Jane🙂',
            'Jane™',
            'Janeⓐ',
            'Jane＇Doe',
            'Jane－Doe',
            'Ja\u200dne',
            'Jane\u2028Doe',
            'Jane\ud800',
        ])('rejects unsupported characters instead of dropping them from %j', value => {
            expect(validationError({ ...validInput, [field]: value })).toMatchObject({
                field,
                code: 'unsupported_characters',
            })
        })

        it('accepts exactly 100 raw Unicode code points when the normalized token fits', () => {
            const result = normalizeFindingInput({ ...validInput, [field]: `A${"'".repeat(99)}` })

            expect(result[field]).toBe('a')
        })

        it('rejects 101 raw Unicode code points even when normalization would produce one letter', () => {
            expect(validationError({ ...validInput, [field]: `A${"'".repeat(100)}` })).toMatchObject({
                field,
                code: 'too_long',
            })
        })

        it('counts supplementary characters as one Unicode code point each', () => {
            const result = normalizeFindingInput({ ...validInput, [field]: '𝐀'.repeat(64) })

            expect(result[field]).toBe('a'.repeat(64))
        })

        it('accepts a 64-character normalized token', () => {
            const result = normalizeFindingInput({ ...validInput, [field]: 'A'.repeat(64) })

            expect(result[field]).toBe('a'.repeat(64))
        })

        it.each(['a'.repeat(65), 'ﬃ'.repeat(22)])('rejects an oversized normalized token from %j', value => {
            expect(validationError({ ...validInput, [field]: value })).toMatchObject({ field, code: 'too_long' })
        })
    })

    describe('domain validation', () => {
        it.each([
            ['Example.COM', 'example.com'],
            ['  Example.COM.  ', 'example.com'],
            ['WWW.Sales.Example.COM.', 'www.sales.example.com'],
            ['sales-team.example.com', 'sales-team.example.com'],
            ['a.b', 'a.b'],
            ['123.example', '123.example'],
            ['bücher.de', 'xn--bcher-kva.de'],
            ['BÜCHER.DE.', 'xn--bcher-kva.de'],
            ['faß.de', 'xn--fa-hia.de'],
            ['例え.テスト', 'xn--r8jz45g.xn--zckzah'],
            ['xn--bcher-kva.de', 'xn--bcher-kva.de'],
            ['ＥＸＡＭＰＬＥ．ＣＯＭ', 'example.com'],
            ['example。com', 'example.com'],
        ])('canonicalizes %j to the exact hostname %j', (domain, expected) => {
            expect(normalizeFindingInput({ ...validInput, domain })).toEqual({
                firstName: 'jane',
                lastName: 'doe',
                domain: expected,
            })
        })

        it.each([
            ['null', null],
            ['undefined', undefined],
            ['a number', 42],
            ['a boolean', true],
            ['an array', ['example.com']],
            ['an object', { domain: 'example.com' }],
            ['a boxed string', new String('example.com')],
            ['a symbol', Symbol('example.com')],
        ])('rejects %s without coercion', (_description, domain) => {
            expect(validationError({ ...validInput, domain })).toMatchObject({ field: 'domain', code: 'invalid_type' })
        })

        it.each(['', '   ', '\u00a0\u2009\u3000'])('requires a nonblank domain for %j', domain => {
            expect(validationError({ ...validInput, domain })).toMatchObject({ field: 'domain', code: 'required' })
        })

        it.each([
            '\texample.com',
            'example.com\n',
            'example.com\r',
            'exam\0ple.com',
            'example.\u007fcom',
            'example.\u0085com',
        ])('rejects control characters before trimming %j', domain => {
            expect(validationError({ ...validInput, domain })).toMatchObject({
                field: 'domain',
                code: 'control_characters',
            })
        })

        it.each([
            'https://example.com',
            '//example.com',
            'example.com/path',
            'example.com\\path',
            'jane@example.com',
            'example.com:443',
            '[example.com]',
            '*.example.com',
            'example.com?query=value',
            'example.com#fragment',
            'example .com',
            'example\u00a0.com',
            'example\u2028.com',
            '%65xample.com',
            'example%2ecom',
            'example.com%2fpath',
            'example.com|elsewhere.com',
            'example<com',
            'example>com',
            'localhost',
            '.',
            '.example.com',
            'example..com',
            'example.com..',
            'example。com。',
            '-example.com',
            'example-.com',
            'example.-com',
            'example.com-',
            'example_name.com',
            'example.123',
            'example.１２３',
            '127.0.0.1',
            '１２７。０。０。１',
            '127.1',
            '0177.0.0.1',
            '0x7f.0.0.1',
            '2130706433',
            '[::1]',
            '2001:db8::1',
            'xn--.com',
            'xn--invalid-.com',
            '\u0301example.com',
            'exam\u200dple.com',
            'exam\ud800ple.com',
        ])('rejects malformed or non-hostname input %j', domain => {
            expect(validationError({ ...validInput, domain })).toMatchObject({
                field: 'domain',
                code: 'invalid_domain',
            })
        })

        it('accepts a label of exactly 63 ASCII characters', () => {
            const domain = `${'a'.repeat(63)}.com`

            expect(normalizeFindingInput({ ...validInput, domain }).domain).toBe(domain)
        })

        it.each([`${'a'.repeat(64)}.com`, `${'é'.repeat(58)}.com`])(
            'rejects a label exceeding 63 ASCII bytes in %j',
            domain => {
                expect(validationError({ ...validInput, domain })).toMatchObject({
                    field: 'domain',
                    code: 'invalid_domain',
                })
            },
        )

        it('accepts a complete hostname of exactly 253 ASCII bytes', () => {
            const domain = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`

            expect(domain).toHaveLength(253)
            expect(normalizeFindingInput({ ...validInput, domain }).domain).toBe(domain)
        })

        it('accepts a raw domain of exactly 253 characters including its final root dot', () => {
            const domain = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(60)}`

            expect(`${domain}.`).toHaveLength(253)
            expect(normalizeFindingInput({ ...validInput, domain: `${domain}.` }).domain).toBe(domain)
        })

        it('rejects 254 raw characters before removing a final root dot', () => {
            const domain = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}.`

            expect(domain).toHaveLength(254)
            expect(validationError({ ...validInput, domain })).toMatchObject({ field: 'domain', code: 'too_long' })
        })

        it('rejects 254 raw characters before trimming surrounding spaces', () => {
            const domain = ` ${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(60)} `

            expect(domain).toHaveLength(254)
            expect(validationError({ ...validInput, domain })).toMatchObject({ field: 'domain', code: 'too_long' })
        })

        it('rejects IDNA expansion beyond 253 ASCII bytes even when each expanded label fits', () => {
            const label = 'é'.repeat(57)
            const domain = `${label}.${label}.${label}.${label}`

            expect(domain).toHaveLength(231)
            expect(validationError({ ...validInput, domain })).toMatchObject({ field: 'domain', code: 'too_long' })
        })
    })

    it('keeps submitted values out of typed validation errors', () => {
        const first = validationError({ ...validInput, firstName: 'PrivatePersonOne9' })
        const second = validationError({ ...validInput, firstName: 'PrivatePersonTwo8' })
        const domain = validationError({ ...validInput, domain: 'private-company.example/path' })

        expect(first.message).toBe(second.message)
        expect(first).toMatchObject({ field: 'firstName', code: 'unsupported_characters' })
        expect(domain).toMatchObject({ field: 'domain', code: 'invalid_domain' })
        expect(`${first.message} ${first.stack} ${JSON.stringify(first)}`).not.toContain('PrivatePersonOne9')
        expect(`${second.message} ${second.stack} ${JSON.stringify(second)}`).not.toContain('PrivatePersonTwo8')
        expect(`${domain.message} ${domain.stack} ${JSON.stringify(domain)}`).not.toContain(
            'private-company.example/path',
        )
    })
})
