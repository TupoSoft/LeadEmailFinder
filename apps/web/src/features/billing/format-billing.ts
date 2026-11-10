export function formatCredits(credits: number): string {
    return new Intl.NumberFormat('en').format(credits)
}
