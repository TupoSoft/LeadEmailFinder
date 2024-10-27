import type { EmailFormat, Lead } from './entities'

const emailFormats = [
    '{first}.{last}',
    '{f}{last}',
    '{f}.{last}',
    '{first}{last}',
    '{first}{l}',
    '{last}',
    '{first}.{l}',
    '{last}.{first}',
    '{first}_{last}',
    '{last}{f}',
    '{f}{l}',
    '{l}{first}',
    '{l}.{first}',
    '{last}{first}',
    '{first}-{last}',
    '{first}',
    '{f}',
]

export function getAllEmailFormats(): EmailFormat[] {
    const emailFormatToCount: EmailFormat[] = []

    for (const emailFormat of emailFormats) {
        emailFormatToCount.push({ name: emailFormat, count: 0 })
    }

    return emailFormatToCount
}

export function mergeEmailFormats(arr1: EmailFormat[], arr2: EmailFormat[]): EmailFormat[] {
    const formatMap = new Map<string, EmailFormat>()

    for (const format of arr1) {
        formatMap.set(format.name, format)
    }

    for (const format of arr2) {
        const existingFormat = formatMap.get(format.name)
        if (existingFormat !== undefined) {
            formatMap.set(existingFormat.name, {
                name: existingFormat.name,
                count: existingFormat.count + format.count,
            })
        } else {
            formatMap.set(format.name, format)
        }
    }

    return Array.from(formatMap.values()).sort((a, b) => b.count - a.count)
}

export function getFormatToEmailMapForLead(lead: Lead): Record<string, string> {
    const { firstName, lastName, domain } = lead
    const formatToEmailMap: Record<string, string> = {}

    for (const emailFormat of emailFormats) {
        formatToEmailMap[emailFormat] = emailFormat
            .replace('{first}', firstName)
            .replace('{last}', lastName)
            .replace('{f}', firstName.charAt(0))
            .replace('{l}', lastName.charAt(0))

        formatToEmailMap[emailFormat] += '@' + domain
    }

    return formatToEmailMap
}
