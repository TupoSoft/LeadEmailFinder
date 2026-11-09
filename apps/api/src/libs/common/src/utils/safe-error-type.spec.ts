import { safeErrorType } from './safe-error-type'

describe('safeErrorType', () => {
    it('returns stable allowlisted error constructor names', () => {
        class ExpectedFailure extends Error {}

        expect(safeErrorType(new Error('private message'))).toBe('Error')
        expect(safeErrorType(new ExpectedFailure('private message'))).toBe('ExpectedFailure')
    })

    it('does not copy hostile constructor data from an Error', () => {
        const sentinel = 'sentinel@example.test'
        const error = new Error('private message')
        Object.defineProperty(error, 'constructor', { value: { name: sentinel } })

        expect(safeErrorType(error)).toBe('Error')
        expect(safeErrorType(error)).not.toContain(sentinel)
    })

    it('falls back safely when the constructor property throws', () => {
        const error = new Error('private message')
        Object.defineProperty(error, 'constructor', {
            get: () => {
                throw new Error('private constructor')
            },
        })

        expect(safeErrorType(error)).toBe('Error')
    })

    it('uses a fixed type for non-error values', () => {
        expect(safeErrorType({ name: 'sentinel@example.test' })).toBe('UnknownError')
    })
})
