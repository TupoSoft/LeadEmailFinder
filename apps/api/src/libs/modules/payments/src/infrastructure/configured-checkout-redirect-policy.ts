import { validateCheckoutRedirect } from '@tuposoft/lead-email-finder/common/checkout-redirect'
import { CheckoutRedirectPolicy } from '../application/ports/checkout-redirect-policy'

export class ConfiguredCheckoutRedirectPolicy implements CheckoutRedirectPolicy {
    private readonly allowedOrigins: readonly string[]

    constructor(allowedOrigins: readonly string[]) {
        this.allowedOrigins = Object.freeze([...allowedOrigins])
    }

    assertAllowed(redirectUrl: string): string {
        return validateCheckoutRedirect(redirectUrl, this.allowedOrigins)
    }
}
