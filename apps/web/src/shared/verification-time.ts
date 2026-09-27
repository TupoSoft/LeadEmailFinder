const formatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' })

export function formatVerificationTime(value: string | number | null): string {
    if (value === null) return 'Not reported'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Not reported' : `${formatter.format(date)} UTC`
}
