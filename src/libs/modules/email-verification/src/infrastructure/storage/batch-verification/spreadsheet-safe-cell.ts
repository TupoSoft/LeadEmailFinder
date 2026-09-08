/** CSV quoting does not prevent spreadsheet formula execution. Preserve content behind an apostrophe. */
export function spreadsheetSafeCell(value: string): string {
    return /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value
}
