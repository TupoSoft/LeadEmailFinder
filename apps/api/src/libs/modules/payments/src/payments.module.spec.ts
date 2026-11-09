import { ConfigService } from '@nestjs/config'
import { Global, Module } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import {
    AuditLogEntry,
    CreditDebit,
    CreditGrant,
    CreditReservation,
    ExternalIdentity,
    Organization,
    OrganizationCreditAccount,
    OrganizationInvitation,
    OrganizationMembership,
    ServiceCredential,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { CHECKOUT_REDIRECT_POLICY, CheckoutRedirectPolicy } from './application/ports/checkout-redirect-policy'
import { CreditPackCatalog } from './application/credit-pack-catalog'
import { CreditPurchaseService } from './application/credit-purchase.service'
import { PaymentAdjustmentHandler } from './application/payment-adjustment.handler'
import { PaymentEventHandler } from './application/payment-event.handler'
import { PAYMENT_ADJUSTMENT_STORE } from './application/ports/payment-adjustment-store'
import { PAYMENT_EVENT_LOGGER } from './application/ports/payment-event-logger'
import { PAYMENT_PROVIDER, PaymentProvider } from './application/ports/payment-provider'
import { PAYMENT_PURCHASE_STORE } from './application/ports/payment-purchase-store'
import { PaddlePaymentProvider } from './infrastructure/paddle/paddle-payment-provider'
import { TypeOrmPaymentAdjustmentStore } from './infrastructure/persistence/typeorm-payment-adjustment.store'
import { TypeOrmPaymentPurchaseStore } from './infrastructure/persistence/typeorm-payment-purchase.store'
import { CreditPurchaseAdjustment } from './infrastructure/persistence/typeorm/credit-purchase-adjustment.entity'
import { CreditPurchase } from './infrastructure/persistence/typeorm/credit-purchase.entity'
import { StubPaymentProvider } from './infrastructure/stub-payment-provider'
import { PaymentsModule } from './payments.module'

const baseConfig = new Map<string, string>([
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
    ['PAYMENTS_CHECKOUT_URL', 'http://localhost:3000/payment-return'],
])

// CreditsModule (still imported for CreditsService) pulls in identity's TypeOrmCreditLedgerStore, which injects
// a bare DataSource for its pessimistic-locking transactions. Nest eagerly instantiates every provider in every
// imported module regardless of overrides elsewhere or export visibility, so this graph needs a DataSource
// somewhere even though nothing here exercises real credit-ledger behavior. A @Global() stub reaches it without
// identity exporting the adapter. module-architecture/08 stopped IdentityModule from exporting TypeOrmModule, but
// its internal TypeOrmModule.forFeature(10 entities) registration still instantiates eagerly regardless of export
// status — confirmed empirically: removing these ten overrides breaks this suite with the stub DataSource
// missing entityMetadatas, so they stay.
@Global()
@Module({
    providers: [{ provide: DataSource, useValue: {} }],
    exports: [DataSource],
})
class TestDataSourceModule {}

async function compilePaymentsModule(configOverrides: ReadonlyMap<string, string>): Promise<TestingModule> {
    const config = new Map([...baseConfig, ...configOverrides])
    return Test.createTestingModule({ imports: [PaymentsModule, TestDataSourceModule] })
        .overrideProvider(ConfigService)
        .useValue({ getOrThrow: (key: string) => config.get(key), get: (key: string) => config.get(key) })
        .overrideProvider(getRepositoryToken(CreditPurchase))
        .useValue({})
        .overrideProvider(getRepositoryToken(CreditPurchaseAdjustment))
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
        .overrideProvider(getRepositoryToken(CreditReservation))
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
        .overrideProvider(TypeOrmPaymentAdjustmentStore)
        .useValue({})
        .overrideProvider(PaymentAdjustmentHandler)
        .useValue({})
        .compile()
}

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
        expect(
            imports.some(module =>
                module.providers?.some(provider => provider.provide === getRepositoryToken(CreditPurchaseAdjustment)),
            ),
        ).toBe(true)
    })

    it('provides every use case via an explicit factory injecting its identity/payment ports', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PaymentsModule) as Array<{
            provide?: unknown
            inject?: unknown[]
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: CreditPackCatalog, inject: [ConfigService] }),
                expect.objectContaining({
                    provide: CreditPurchaseService,
                    inject: [
                        PAYMENT_PURCHASE_STORE,
                        CreditPackCatalog,
                        PAYMENT_PROVIDER,
                        ConfigService,
                        CHECKOUT_REDIRECT_POLICY,
                    ],
                }),
                expect.objectContaining({
                    provide: PaymentAdjustmentHandler,
                    inject: [PAYMENT_ADJUSTMENT_STORE, CreditsService],
                }),
                expect.objectContaining({
                    provide: PaymentEventHandler,
                    inject: [PAYMENT_PURCHASE_STORE, CreditsService, PaymentAdjustmentHandler, PAYMENT_EVENT_LOGGER],
                }),
                expect.objectContaining({ provide: PAYMENT_PROVIDER, inject: [ConfigService] }),
            ]),
        )
    })

    it('resolves the stub through the payment provider port', async () => {
        const moduleRef = await compilePaymentsModule(
            new Map([
                ['PAYMENTS_PROVIDER', 'stub'],
                ['PAYMENTS_STUB_WEBHOOK_SECRET', 'module-test-secret'],
            ]),
        )

        const provider = moduleRef.get<PaymentProvider>(PAYMENT_PROVIDER)

        expect(provider).toBeInstanceOf(StubPaymentProvider)
        const policy = moduleRef.get<CheckoutRedirectPolicy>(CHECKOUT_REDIRECT_POLICY)
        expect(policy.assertAllowed('http://localhost:3000/payment-return')).toBe(
            'http://localhost:3000/payment-return',
        )
        expect(() => policy.assertAllowed('https://unconfigured.test')).toThrow()
        await moduleRef.close()
    })

    it('refuses Paddle startup without explicit checkout origins', async () => {
        await expect(
            compilePaymentsModule(
                new Map([
                    ['PAYMENTS_PROVIDER', 'paddle'],
                    ['PADDLE_API_KEY', 'test-key'],
                    ['PADDLE_WEBHOOK_SECRET', 'test-secret'],
                    ['PADDLE_ENVIRONMENT', 'sandbox'],
                ]),
            ),
        ).rejects.toThrow()
    })

    it('resolves Paddle through the payment provider port', async () => {
        const moduleRef = await compilePaymentsModule(
            new Map([
                ['PAYMENTS_PROVIDER', 'paddle'],
                ['PAYMENTS_CHECKOUT_ALLOWED_ORIGINS', 'https://sandbox-checkout.paddle.com'],
                ['PADDLE_API_KEY', 'paddle-module-test-key'],
                ['PADDLE_WEBHOOK_SECRET', 'paddle-module-test-secret'],
                ['PADDLE_ENVIRONMENT', 'sandbox'],
            ]),
        )

        expect(moduleRef.get<PaymentProvider>(PAYMENT_PROVIDER)).toBeInstanceOf(PaddlePaymentProvider)
        await moduleRef.close()
    })
})
