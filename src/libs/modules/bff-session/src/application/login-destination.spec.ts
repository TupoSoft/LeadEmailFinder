import { normalizeLoginDestination } from './login-destination'

const origin = 'https://app.example.test'

describe('normalizeLoginDestination', () => {
    it.each([
        '/app',
        '/app/',
        '/app/verification',
        '/app/verification?view=recent#results',
        '/app/search?q=hello%20world',
    ])('preserves safe application destination %s', value => {
        expect(normalizeLoginDestination(value, origin)).toBe(value)
    })

    it.each([
        undefined,
        null,
        [],
        {},
        '',
        ' /app',
        '/app ',
        '/application',
        '//evil.test/app',
        'https://app.example.test/app',
        'https://evil.test/app',
        '/%2f%2fevil.test/app',
        '/app/../auth/error',
        '/app/./verification',
        '/app/%2e%2e/auth/error',
        '/app/%252e%252e/auth/error',
        '/app/%2f%2fevil.test',
        '/app/\\evil.test',
        '/app//evil.test',
        '/app/%',
        '/app/%zz',
        '/app\n/verification',
        '/app/verification?x=%',
        '/',
        '/auth/error',
        '/v1/auth/login',
        '/app/session-expired',
        '/app/session-expired?destination=/app',
        '/app/account-unavailable',
        '/app/forbidden',
        '/app/auth/callback',
        '/app/a/../b',
        '/app/' + 'x'.repeat(2048),
    ])('falls back for an unsafe, malformed, public, or recovery destination (%p)', value => {
        expect(normalizeLoginDestination(value, origin)).toBe('/app')
    })
})
