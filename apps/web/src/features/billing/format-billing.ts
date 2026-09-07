import { billingCopy } from '../../content/billing'

export function formatCredits(credits: number): string {
    return new Intl.NumberFormat('en').format(credits)
}

export function formatMoney(amountMinor: number, currency: string): string {
    try {
        const formatter = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' })
        const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2
        return formatter.format(amountMinor / 10 ** fractionDigits)
    } catch {
        return billingCopy.unavailableAmount
    }
}

export function formatPurchaseDate(value: string): string {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? billingCopy.unavailableDate
        : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) +
              ' UTC'
}
