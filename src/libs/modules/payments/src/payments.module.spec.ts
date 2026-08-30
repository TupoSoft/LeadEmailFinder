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
    ExternalIdentity,
    Organization,
    OrganizationCreditAccount,
    OrganizationInvitation,
    OrganizationMembership,
    ServiceCredential,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { PaymentProvider, PAYMENT_PROVIDER } from './payment-provider'
import { CreditPurchaseAdjustment } from './credit-purchase-adjustment.entity'
import { CreditPurchase } from './credit-purchase.entity'
import { PaymentsModule } from './payments.module'
import { StubPaymentProvider } from './infrastructure/stub-payment-provider'
import { PaymentEventHandler } from './payment-event.handler'
import { TypeOrmPaymentPurchaseStore } from './infrastructure/typeorm-payment-purchase.store'
import { TypeOrmPaymentAdjustmentStore } from './infrastructure/typeorm-payment-adjustment.store'
import { PaymentAdjustmentHandler } from './payment-adjustment.handler'
import { PaddlePaymentProvider } from './infrastructure/paddle/paddle-payment-provider'

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

// Identity's TypeOrmCreditLedgerStore (unexported, private to identity) injects a bare DataSource for its
// pessimistic-locking transactions. Nest eagerly instantiates every provider in every imported module
// regardless of overrides elsewhere, so this graph needs a DataSource somewhere even though nothing here
// exercises real credit-ledger behavior. A @Global() stub reaches it without identity exporting the adapter.
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
        .useValue({ getOrThrow: (key: string) => config.get(key) })
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
                module.providers?.some(
                    provider => provider.provide === getRepositoryToken(CreditPurchaseAdjustment),
                ),
            ),
        ).toBe(true)
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
        await moduleRef.close()
    })

    it('resolves Paddle through the payment provider port', async () => {
        const moduleRef = await compilePaymentsModule(
            new Map([
                ['PAYMENTS_PROVIDER', 'paddle'],
                ['PADDLE_API_KEY', 'paddle-module-test-key'],
                ['PADDLE_WEBHOOK_SECRET', 'paddle-module-test-secret'],
                ['PADDLE_ENVIRONMENT', 'sandbox'],
            ]),
        )

        expect(moduleRef.get<PaymentProvider>(PAYMENT_PROVIDER)).toBeInstanceOf(PaddlePaymentProvider)
        await moduleRef.close()
    })
})
