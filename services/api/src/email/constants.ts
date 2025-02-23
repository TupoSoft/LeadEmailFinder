import { EmailPattern } from './enums'

export const RESOURCE = 'emails'
export const EMAIL_ROUTE = `/${RESOURCE}`
export const EMAIL_ROUTE_WITH_PARAM = `${EMAIL_ROUTE}/:email`

export const EMAIL_PATTERNS = [
    EmailPattern.LastFirst,
    EmailPattern.FirstLast,
    EmailPattern.FirstDotL,
    EmailPattern.FirstL,
    EmailPattern.FLast,
    EmailPattern.FL,
    EmailPattern.FDotLast,
    EmailPattern.First,
    EmailPattern.Last,
    EmailPattern.FirstLastNoSeparator,
    EmailPattern.FirstUnderscoreLast,
    EmailPattern.LastF,
    EmailPattern.LFirst,
    EmailPattern.LDotFirst,
    EmailPattern.LastFirstNoSeparator,
    EmailPattern.FirstHyphenLast,
] as const
