import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { Repository } from 'typeorm'
import { CreditPackCatalog } from './credit-pack-catalog'
import { CreditPurchase, CreditPurchaseStatus } from './credit-purchase.entity'
import { PaymentConfiguration, PaymentsProviderName } from './payment-configuration'
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider'

export interface StartedCreditPurchase {
    readonly purchase: CreditPurchase
    readonly redirectUrl: string
}

export class PaymentCheckoutError extends Error {
    constructor(cause: unknown) {
        super('Payment provider could not create a checkout', { cause })
        this.name = PaymentCheckoutError.name
    }
}

@Injectable()
export class CreditPurchaseService {
    private readonly providerName: PaymentsProviderName
    private readonly checkoutUrl: string

    constructor(
        @InjectRepository(CreditPurchase) private readonly purchaseRepo: Repository<CreditPurchase>,
        private readonly catalog: CreditPackCatalog,
        @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
        configService: ConfigService<PaymentConfiguration, true>,
    ) {
        this.providerName = configService.getOrThrow('PAYMENTS_PROVIDER')
        this.checkoutUrl = configService.getOrThrow('PAYMENTS_CHECKOUT_URL')
    }

    async start(principal: AuthPrincipal, packId: string): Promise<StartedCreditPurchase> {
        const pack = this.catalog.get(packId)
        const purchase = await this.purchaseRepo.save(
            this.purchaseRepo.create({
                organizationId: principal.organizationId,
                packId: pack.id,
                credits: pack.credits,
                amountMinor: pack.amountMinor,
                currency: pack.currency,
                provider: this.providerName,
                status: CreditPurchaseStatus.PENDING,
            }),
        )

        try {
            const checkout = await this.paymentProvider.createCheckout({
                purchaseId: purchase.id,
                organizationId: principal.organizationId,
                pack,
                returnUrl: this.checkoutUrl,
            })
            purchase.providerReference = checkout.providerReference
            const savedPurchase = await this.purchaseRepo.save(purchase)

            return { purchase: savedPurchase, redirectUrl: checkout.redirectUrl }
        } catch (error) {
            purchase.status = CreditPurchaseStatus.FAILED
            await this.purchaseRepo.save(purchase)
            throw new PaymentCheckoutError(error)
        }
    }

    listForOrganization(organizationId: string): Promise<CreditPurchase[]> {
        return this.purchaseRepo.find({
            where: { organizationId },
            order: { createdAt: 'DESC' },
        })
    }
}
