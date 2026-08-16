import { CredentialExtractor, isJwtShapedToken } from './credential-extractor'

describe('CredentialExtractor', () => {
    const extractor = new CredentialExtractor()

    it('extracts a bearer token from the Authorization header', () => {
        const credential = extractor.extract({ authorization: 'Bearer token-value' })

        expect(credential).toEqual({ scheme: 'bearer', token: 'token-value' })
    })

    it('extracts an x-api-key token when no bearer token is present', () => {
        const credential = extractor.extract({ 'x-api-key': 'key-value' })

        expect(credential).toEqual({ scheme: 'x-api-key', token: 'key-value' })
    })

    it('prefers the bearer token when both headers are present', () => {
        const credential = extractor.extract({ authorization: 'Bearer token-value', 'x-api-key': 'key-value' })

        expect(credential).toEqual({ scheme: 'bearer', token: 'token-value' })
    })

    it('takes the first value when a header is repeated', () => {
        const credential = extractor.extract({ 'x-api-key': ['first-value', 'second-value'] })

        expect(credential).toEqual({ scheme: 'x-api-key', token: 'first-value' })
    })

    it('returns undefined when the Authorization header has no Bearer prefix', () => {
        const credential = extractor.extract({ authorization: 'Basic dXNlcjpwYXNz' })

        expect(credential).toBeUndefined()
    })

    it('returns undefined when no credential header is present', () => {
        const credential = extractor.extract({})

        expect(credential).toBeUndefined()
    })
})

describe('isJwtShapedToken', () => {
    it('returns true for a three-segment token', () => {
        expect(isJwtShapedToken('header.payload.signature')).toBe(true)
    })

    it.each(['not-a-jwt', 'header.payload', 'a.b.c.d'])('returns false for %s', token => {
        expect(isJwtShapedToken(token)).toBe(false)
    })
})
