import { CredentialRejectedError } from './credential-authenticator'
import { BFF_SESSION_COOKIE_NAME, CredentialExtractor } from './credential-extractor'

describe('CredentialExtractor', () => {
    const extractor = new CredentialExtractor()

    it('uses only the configured native HTTPS cookie name', () => {
        const secure = new CredentialExtractor('__Secure-lef_session')
        expect(secure.extract({ cookie: 'lef_session=legacy' })).toBeUndefined()
        expect(secure.extract({ cookie: '__Secure-lef_session=native%2Esignature' })).toEqual({
            scheme: 'session-cookie',
            token: 'native.signature',
        })
    })

    it.each(['lef_session=a; lef_session=b', 'lef_session=%ZZ; lef_session=b'])(
        'rejects ambiguous session cookies (%s)',
        cookie => {
            expect(() => extractor.extract({ cookie })).toThrow(CredentialRejectedError)
            expect(extractor.extract({ authorization: 'Bearer key', cookie })).toEqual({
                scheme: 'bearer',
                token: 'key',
            })
        },
    )

    it('extracts a bearer token from the Authorization header', () => {
        const credential = extractor.extract({ authorization: 'Bearer token-value' })

        expect(credential).toEqual({ scheme: 'bearer', token: 'token-value' })
    })

    it.each([
        ['Bearer first-value', 'Bearer second-value'],
        'Basic dXNlcjpwYXNz',
        '',
        'Bearer ',
        'Bearer a,b',
        'Bearer a b',
    ])('rejects malformed or duplicate authorization without cookie fallback: %s', authorization => {
        expect(() => extractor.extract({ authorization, cookie: `${BFF_SESSION_COOKIE_NAME}=valid-session` })).toThrow(
            CredentialRejectedError,
        )
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
