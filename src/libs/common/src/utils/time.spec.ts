import { parseTimeString } from './time'

describe('parseTimeString', (): void => {
    it.each([
        ['30s', 30 * 1000],
        ['5m', 5 * 60 * 1000],
        ['2h', 2 * 60 * 60 * 1000],
        ['1d', 24 * 60 * 60 * 1000],
        ['0s', 0],
        ['120s', 120 * 1000],
    ])('parses "%s" into %i milliseconds', (timeStr, expected): void => {
        expect(parseTimeString(timeStr)).toBe(expected)
    })

    it.each(['', '10', '10x', 's10', '-5s', '5 s', '5S'])('throws for an invalid time string: %s', (timeStr): void => {
        expect(() => parseTimeString(timeStr)).toThrow('Invalid time string')
    })
})
