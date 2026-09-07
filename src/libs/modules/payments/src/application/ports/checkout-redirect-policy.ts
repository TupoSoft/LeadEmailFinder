export const CHECKOUT_REDIRECT_POLICY = Symbol('CHECKOUT_REDIRECT_POLICY')

/** Validates infrastructure output before any hosted checkout URL reaches a customer. */
export interface CheckoutRedirectPolicy {
    assertAllowed(redirectUrl: string): string
}
