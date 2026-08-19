import { ConfigService } from '@nestjs/config'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import {
    AuditLogEntry,
    CreditDebit,
    CreditGrant,
    ExternalIdentity,
    Organization,
    OrganizationCreditAccount,
    OrganizationInvitation,
    OrganizationMembership,
    ServiceCredential,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from '../credits/credits.service'
import { PaymentProvider, PAYMENT_PROVIDER } from './payment-provider'
import { CreditPurchase } from './credit-purchase.entity'
import { PaymentsModule } from './payments.module'
import { StubPaymentProvider } from './infrastructure/stub-payment-provider'
import { PaymentEventHandler } from './payment-event.handler'
import { TypeOrmPaymentPurchaseStore } from './infrastructure/typeorm-payment-purchase.store'

describe('PaymentsModule', () => {
    it('registers the purchase repository with TypeORM', () => {
        const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, PaymentsModule) as Array<{
            providers?: Array<{ provide?: unknown }>
        }>

        expect(
            imports.some(module =>
                module.providers?.some(provider => provider.provide === getRepositoryToken(CreditPurchase)),
            ),
        ).toBe(true)
    })

    it('resolves the stub through the payment provider port', async () => {
        const config = new Map<string, string>([
            ['PAYMENTS_PROVIDER', 'stub'],
            [
                'PAYMENTS_CREDIT_PACKS',
                JSON.stringify({
                    starter: {
                        credits: 100,
                        amountMinor: 500,
                        currency: 'USD',
                        providerPriceId: 'price_starter',
                    },
                }),
            ],
            ['PAYMENTS_STUB_WEBHOOK_SECRET', 'module-test-secret'],
            ['PAYMENTS_CHECKOUT_RETURN_URL', 'http://localhost:3000/payment-return'],
        ])
        const moduleRef = await Test.createTestingModule({ imports: [PaymentsModule] })
            .overrideProvider(ConfigService)
            .useValue({ getOrThrow: (key: string) => config.get(key) })
            .overrideProvider(getRepositoryToken(CreditPurchase))
            .useValue({})
            .overrideProvider(getRepositoryToken(Organization))
            .useValue({})
            .overrideProvider(getRepositoryToken(ExternalIdentity))
            .useValue({})
            .overrideProvider(getRepositoryToken(OrganizationMembership))
            .useValue({})
            .overrideProvider(getRepositoryToken(ServiceCredential))
            .useValue({})
            .overrideProvider(getRepositoryToken(OrganizationCreditAccount))
            .useValue({})
            .overrideProvider(getRepositoryToken(CreditDebit))
            .useValue({})
            .overrideProvider(getRepositoryToken(CreditGrant))
            .useValue({})
            .overrideProvider(getRepositoryToken(OrganizationInvitation))
            .useValue({})
            .overrideProvider(getRepositoryToken(AuditLogEntry))
            .useValue({})
            .overrideProvider(CreditsService)
            .useValue({})
            .overrideProvider(PaymentEventHandler)
            .useValue({})
            .overrideProvider(TypeOrmPaymentPurchaseStore)
            .useValue({})
            .compile()

        const provider = moduleRef.get<PaymentProvider>(PAYMENT_PROVIDER)

        expect(provider).toBeInstanceOf(StubPaymentProvider)
        await moduleRef.close()
    })
})
