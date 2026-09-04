import { BFF_SESSION_COOKIE_NAME, CredentialExtractor, isJwtShapedToken } from './credential-extractor'

describe('CredentialExtractor', () => {
    const extractor = new CredentialExtractor()

    it('extracts a bearer token from the Authorization header', () => {
        const credential = extractor.extract({ authorization: 'Bearer token-value' })

        expect(credential).toEqual({ scheme: 'bearer', token: 'token-value' })
    })

    it('takes the first value when a header is repeated', () => {
        const credential = extractor.extract({ authorization: ['Bearer first-value', 'Bearer second-value'] })

        expect(credential).toEqual({ scheme: 'bearer', token: 'first-value' })
    })

    it('returns undefined when the Authorization header has no Bearer prefix', () => {
        const credential = extractor.extract({ authorization: 'Basic dXNlcjpwYXNz' })

        expect(credential).toBeUndefined()
    })

    it('returns undefined when no credential header is present', () => {
        const credential = extractor.extract({})

        expect(credential).toBeUndefined()
    })

    it('extracts a session cookie when no bearer header is present', () => {
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

    it('returns undefined when the cookie header has no session cookie', () => {
        const credential = extractor.extract({ cookie: 'other_cookie=irrelevant' })

        expect(credential).toBeUndefined()
    })

    it('treats a malformed percent-encoded session cookie as absent', () => {
        const credential = extractor.extract({ cookie: `${BFF_SESSION_COOKIE_NAME}=%ZZ` })

        expect(credential).toBeUndefined()
    })

    it('ignores a malformed unrelated cookie without hiding a valid session cookie', () => {
        const credential = extractor.extract({
            cookie: `unrelated=%ZZ; ${BFF_SESSION_COOKIE_NAME}=valid-session`,
        })

        expect(credential).toEqual({ scheme: 'session-cookie', token: 'valid-session' })
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
