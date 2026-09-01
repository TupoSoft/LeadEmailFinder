import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { PaymentsProviderName } from '../domain/payment-configuration'
import { PurchaseRecord } from '../domain/purchase-record'
import { CreditPackCatalog } from './credit-pack-catalog'
import { PaymentProvider } from './ports/payment-provider'
import { PaymentPurchaseStore } from './ports/payment-purchase-store'

export interface StartedCreditPurchase {
    readonly purchase: PurchaseRecord
    readonly redirectUrl: string
}

export class PaymentCheckoutError extends Error {
    constructor(cause: unknown) {
        super('Payment provider could not create a checkout', { cause })
        this.name = PaymentCheckoutError.name
    }
}

export class CreditPurchaseService {
    constructor(
        private readonly store: PaymentPurchaseStore,
        private readonly catalog: CreditPackCatalog,
        private readonly paymentProvider: PaymentProvider,
        private readonly providerName: PaymentsProviderName,
        private readonly checkoutUrl: string,
    ) {}

    async start(principal: AuthPrincipal, packId: string): Promise<StartedCreditPurchase> {
        const pack = this.catalog.get(packId)
        const purchase = await this.store.create({
            organizationId: principal.organizationId,
            packId: pack.id,
            credits: pack.credits,
            amountMinor: pack.amountMinor,
            currency: pack.currency,
            provider: this.providerName,
        })

        try {
            const checkout = await this.paymentProvider.createCheckout({
                purchaseId: purchase.id,
                organizationId: principal.organizationId,
                pack,
                returnUrl: this.checkoutUrl,
            })
            const savedPurchase = await this.store.bindProviderReference(purchase.id, checkout.providerReference)

            return { purchase: savedPurchase, redirectUrl: checkout.redirectUrl }
        } catch (error) {
            await this.store.markFailed(purchase.id)
            throw new PaymentCheckoutError(error)
        }
    }

    listForOrganization(organizationId: string): Promise<PurchaseRecord[]> {
        return this.store.listForOrganization(organizationId)
    }
}
