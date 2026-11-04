import { redactNativeLogMessage } from './redact-native-log-message'

describe('redactNativeLogMessage', () => {
    it('removes URLs, addresses, and token-like values while keeping the diagnostic shape', () => {
        const message = redactNativeLogMessage(
            'Invalid redirect URL: http://localhost:53000/x?token=abc for person@lef.test with Zm9vYmFyYmF6cXV4c3ludGhldGljdG9rZW4',
        )
        expect(message).toBe('Invalid redirect URL: [url] for [email] with [redacted]')
    })

    it('keeps snake_case schema identifiers readable', () => {
        expect(redactNativeLogMessage('Missing tables better_auth_verifications, better_auth_two_factors')).toBe(
            'Missing tables better_auth_verifications, better_auth_two_factors',
        )
    })

    it('keeps ordinary short diagnostics', () => {
        expect(redactNativeLogMessage('Failed to query fallback join for model session:')).toBe(
            'Failed to query fallback join for model session:',
        )
    })
})
