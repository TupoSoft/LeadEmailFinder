import { BFF_SESSION_COOKIE_NAME, CredentialExtractor, isJwtShapedToken } from './credential-extractor'

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

    it('extracts a session cookie when no bearer or x-api-key header is present', () => {
        const credential = extractor.extract({ cookie: `${BFF_SESSION_COOKIE_NAME}=session-id-value` })

        expect(credential).toEqual({ scheme: 'session-cookie', token: 'session-id-value' })
    })

    it('extracts a session cookie among multiple cookies', () => {
        const credential = extractor.extract({
            cookie: `other_cookie=irrelevant; ${BFF_SESSION_COOKIE_NAME}=session-id-value; lef_csrf_token=csrf-value`,
        })

        expect(credential).toEqual({ scheme: 'session-cookie', token: 'session-id-value' })
    })

    it('prefers the bearer token over a session cookie when both are present', () => {
        const credential = extractor.extract({
            authorization: 'Bearer token-value',
            cookie: `${BFF_SESSION_COOKIE_NAME}=session-id-value`,
        })

        expect(credential).toEqual({ scheme: 'bearer', token: 'token-value' })
    })

    it('prefers the x-api-key header over a session cookie when both are present', () => {
        const credential = extractor.extract({
            'x-api-key': 'key-value',
            cookie: `${BFF_SESSION_COOKIE_NAME}=session-id-value`,
        })

        expect(credential).toEqual({ scheme: 'x-api-key', token: 'key-value' })
    })

    it('returns undefined when the cookie header has no session cookie', () => {
        const credential = extractor.extract({ cookie: 'other_cookie=irrelevant' })

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
