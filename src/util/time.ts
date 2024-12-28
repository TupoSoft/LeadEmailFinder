import { ok } from 'node:assert'

type TimeUnit = 's' | 'm' | 'h' | 'd'

function isTimeUnit(value: string): value is TimeUnit {
    return ['s', 'm', 'h', 'd'].includes(value)
}

const SECONDS_IN_MINUTE = 60
const MINUTES_IN_HOUR = SECONDS_IN_MINUTE
const HOURS_IN_DAY = 24

const MILLIS_IN_SECOND = 1000
const MILLIS_IN_MINUTE = SECONDS_IN_MINUTE * MILLIS_IN_SECOND
const MILLIS_IN_HOUR = MINUTES_IN_HOUR * MILLIS_IN_MINUTE
const MILLIS_IN_DAY = HOURS_IN_DAY * MILLIS_IN_HOUR

const UNITS = Object.freeze({
    s: MILLIS_IN_SECOND,
    m: MILLIS_IN_MINUTE,
    h: MILLIS_IN_HOUR,
    d: MILLIS_IN_DAY,
})

const TIME_STRING_REGEX = /^(\d+)([smhd])$/

export function parseTimeString(timeStr: string): number {
    const match = TIME_STRING_REGEX.exec(timeStr)

    if (match == null) {
        throw new Error('Invalid time string')
    }

    const [, value, unit] = match

    ok(isTimeUnit(unit), 'Invalid time unit')

    return parseInt(value, 10) * UNITS[unit]
}
