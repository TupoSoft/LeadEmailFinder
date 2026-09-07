import { describe, expect, it } from 'vitest'
import { safeDestination, signInHref } from './destination'

describe('browser sign-in destinations', () => {
    it.each(['/app', '/app/', '/app/credits', '/app/team?view=active#members', '/app/search?q=hello%20world'])(
        'preserves safe application destination %s',
        destination => {
            expect(safeDestination(destination)).toBe(destination)
            expect(new URL(signInHref(destination), 'https://application.test').searchParams.get('destination')).toBe(
                destination,
            )
        },
    )

    it.each([
        undefined,
        '',
        '/',
        '/application',
        'https://elsewhere.test/app',
        '//elsewhere.test/app',
        '/auth/error',
        '/app/../auth/error',
        '/app/%2e%2e/auth/error',
        '/app\\elsewhere',
        '/app/%5celsewhere',
        '/app/%',
        '/app/%252e%252e/auth/error',
        '/app/line%0abreak',
        '/app/session-expired',
        '/app/account-unavailable?destination=/app',
        '/app/forbidden/',
        '/app/auth/callback',
        '/app/a/../b',
        '/app/../app',
        '/app//credits',
        '/app/%63redits',
        '/app/session-expired/child',
        '/app/account-unavailable/child',
        '/app/forbidden/child',
        '/app/credits?x=%',
        '/app/' + 'x'.repeat(2048),
    ])('replaces unsafe or recovery destination %s with the application home', destination => {
        expect(safeDestination(destination)).toBe('/app')
    })
})
