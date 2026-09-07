export enum PaymentsProviderName {
    STUB = 'stub',
    PADDLE = 'paddle',
}

export enum PaddleEnvironmentName {
    SANDBOX = 'sandbox',
}

export interface PaymentConfiguration {
    PAYMENTS_PROVIDER: PaymentsProviderName
    PAYMENTS_CREDIT_PACKS: string
    PAYMENTS_CHECKOUT_URL: string
    PAYMENTS_CHECKOUT_ALLOWED_ORIGINS?: string
    PAYMENTS_CHECKOUT_RETURN_URL?: string
    PAYMENTS_STUB_WEBHOOK_SECRET?: string
    PADDLE_API_KEY?: string
    PADDLE_WEBHOOK_SECRET?: string
    PADDLE_ENVIRONMENT?: PaddleEnvironmentName
}
