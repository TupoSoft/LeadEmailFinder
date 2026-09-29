import { parseBasicCredentials } from './basic-credentials.js'

describe('parseBasicCredentials', () => {
    it('parses a well-formed Basic value into a clientId/clientSecret pair', () => {
        const encoded = Buffer.from('my-client:my-secret').toString('base64')

        expect(parseBasicCredentials(`Basic ${encoded}`)).toEqual({
            ok: true,
            credentials: { clientId: 'my-client', clientSecret: 'my-secret' },
        })
    })

    it('is case-insensitive about the scheme name', () => {
        const encoded = Buffer.from('my-client:my-secret').toString('base64')

        expect(parseBasicCredentials(`basic ${encoded}`)).toEqual({
            ok: true,
            credentials: { clientId: 'my-client', clientSecret: 'my-secret' },
        })
    })

    it('splits only on the first colon, so a secret may itself contain one', () => {
        const encoded = Buffer.from('my-client:sec:ret').toString('base64')

        expect(parseBasicCredentials(`Basic ${encoded}`)).toEqual({
            ok: true,
            credentials: { clientId: 'my-client', clientSecret: 'sec:ret' },
        })
    })

    it('rejects a missing header', () => {
        expect(parseBasicCredentials(undefined)).toEqual({ ok: false, reason: 'missing_header' })
    })

    it.each([
        ['a Bearer scheme', 'Bearer sometoken'],
        ['no scheme at all', 'not-a-valid-header'],
        ['the Basic scheme with no value', 'Basic'],
    ])('rejects %s', (_description, value) => {
        expect(parseBasicCredentials(value)).toEqual({ ok: false, reason: 'wrong_scheme' })
    })

    it.each([
        ['characters outside the base64 alphabet', 'Basic not!base64@value'],
        ['incorrect padding', 'Basic YWJj='],
    ])('rejects %s as malformed base64', (_description, value) => {
        expect(parseBasicCredentials(value)).toEqual({ ok: false, reason: 'malformed_base64' })
    })

    it('rejects a decoded value with no colon separator', () => {
        const encoded = Buffer.from('no-separator-here').toString('base64')

        expect(parseBasicCredentials(`Basic ${encoded}`)).toEqual({ ok: false, reason: 'missing_separator' })
    })
})
