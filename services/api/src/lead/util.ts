import type { FindLeadRequest } from './dto'
import type { EmailPatternUsage } from '../domain'
import { EMAIL_PATTERNS } from '../email/constants'
import { EmailPattern } from '../email/enums'

const firstNamePatterns = [EmailPattern.First]
const lastNamePatterns = [EmailPattern.Last]

export const deprioritizedEmailFormats = new Set(['{first}', '{last}'])

export function getAllEmailFormats(): EmailPatternUsage[] {
    const emailFormatToCount: EmailPatternUsage[] = []
    const INITIAL_USAGE_COUNT = 0

    for (const pattern of EMAIL_PATTERNS) {
        emailFormatToCount.push({ pattern, usageCount: INITIAL_USAGE_COUNT })
    }

    return emailFormatToCount
}

export function mergeEmailFormats(arr1: EmailPatternUsage[], arr2: EmailPatternUsage[]): EmailPatternUsage[] {
    const formatMap = new Map<string, EmailPatternUsage>()

    for (const format of arr1) {
        formatMap.set(format.pattern, format)
    }

    for (const format of arr2) {
        const existingFormat = formatMap.get(format.pattern)
        if (existingFormat !== undefined) {
            formatMap.set(existingFormat.pattern, {
                pattern: existingFormat.pattern,
                usageCount: existingFormat.usageCount + format.usageCount,
            })
        } else {
            formatMap.set(format.pattern, format)
        }
    }

    return Array.from(formatMap.values()).sort((a, b) => b.usageCount - a.usageCount)
}

export function getFormatToEmailMapForLead(lead: FindLeadRequest): Map<EmailPattern, string> {
    const FIRST_CHAR_POS = 0
    const { firstName, lastName, domain } = lead

    if (firstName !== undefined && lastName !== undefined) {
        return new Map(
            EMAIL_PATTERNS.map(format => [
                format,
                format
                    .replace('{first}', firstName)
                    .replace('{last}', lastName)
                    .replace('{f}', firstName.charAt(FIRST_CHAR_POS))
                    .replace('{l}', lastName.charAt(FIRST_CHAR_POS)) +
                    '@' +
                    domain,
            ]),
        )
    } else if (firstName !== undefined) {
        return new Map(
            firstNamePatterns.map(format => [
                format,
                format.replace('{first}', firstName).replace('{f}', firstName.charAt(FIRST_CHAR_POS)) + '@' + domain,
            ]),
        )
    } else if (lastName !== undefined) {
        return new Map(
            lastNamePatterns.map(format => [
                format,
                format.replace('{last}', lastName).replace('{l}', lastName.charAt(FIRST_CHAR_POS)) + '@' + domain,
            ]),
        )
    } else {
        return new Map()
    }
}
