import { validateCheckoutRedirect } from '../../../../../src/libs/common/src/checkout-redirect'
import { rememberCheckoutHint } from './checkout-return-hint'

export class CheckoutUnavailableError extends Error {
    constructor() {
        super('Checkout is unavailable.')
    }
}

export function safeCheckoutUrl(value: string): string {
    try {
        return validateCheckoutRedirect(value, __PAYMENTS_CHECKOUT_ALLOWED_ORIGINS__)
    } catch {
        throw new CheckoutUnavailableError()
    }
}

export function navigateToCheckout(id: string, url: string): void {
    const safeUrl = safeCheckoutUrl(url)
    rememberCheckoutHint(id)
    window.location.assign(safeUrl)
}
