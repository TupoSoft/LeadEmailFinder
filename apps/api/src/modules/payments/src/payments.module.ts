import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { resolveCheckoutAllowedOrigins } from '@tuposoft/lead-email-finder/common/checkout-redirect'
import { CreditsModule, CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CHECKOUT_REDIRECT_POLICY, CheckoutRedirectPolicy } from './application/ports/checkout-redirect-policy'
import { ConfiguredCheckoutRedirectPolicy } from './infrastructure/configured-checkout-redirect-policy'
import { CreditPackCatalog } from './application/credit-pack-catalog'
import { CreditPurchaseService } from './application/credit-purchase.service'
import { PaymentAdjustmentHandler } from './application/payment-adjustment.handler'
import { PaymentEventHandler } from './application/payment-event.handler'
import { PAYMENT_ADJUSTMENT_STORE, PaymentAdjustmentStore } from './application/ports/payment-adjustment-store'
import { PAYMENT_EVENT_LOGGER, PaymentEventLogger } from './application/ports/payment-event-logger'
import { PAYMENT_PROVIDER, PaymentProvider } from './application/ports/payment-provider'
import { PAYMENT_PURCHASE_STORE, PaymentPurchaseStore } from './application/ports/payment-purchase-store'
import { PaymentConfiguration, PaymentsProviderName } from './domain/payment-configuration'
import { createPaddleProviderDependencies } from './infrastructure/paddle/paddle-client'
import { PaddlePaymentProvider } from './infrastructure/paddle/paddle-payment-provider'
import { NestPaymentEventLogger } from './infrastructure/payment-event-logger'
import { TypeOrmPaymentAdjustmentStore } from './infrastructure/persistence/typeorm-payment-adjustment.store'
import { TypeOrmPaymentPurchaseStore } from './infrastructure/persistence/typeorm-payment-purchase.store'
import { CreditPurchaseAdjustment } from './infrastructure/persistence/typeorm/credit-purchase-adjustment.entity'
import { CreditPurchase } from './infrastructure/persistence/typeorm/credit-purchase.entity'
import { StubPaymentProvider } from './infrastructure/stub-payment-provider'

@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([CreditPurchase, CreditPurchaseAdjustment]), CreditsModule],
    providers: [
        RolePermissionPolicy,
        PermissionsGuard,
        TypeOrmPaymentPurchaseStore,
        TypeOrmPaymentAdjustmentStore,
        NestPaymentEventLogger,
        { provide: PAYMENT_PURCHASE_STORE, useExisting: TypeOrmPaymentPurchaseStore },
        { provide: PAYMENT_ADJUSTMENT_STORE, useExisting: TypeOrmPaymentAdjustmentStore },
        { provide: PAYMENT_EVENT_LOGGER, useExisting: NestPaymentEventLogger },
        {
            provide: CreditPackCatalog,
            inject: [ConfigService],
            useFactory: (configService: ConfigService<PaymentConfiguration, true>) =>
                new CreditPackCatalog(configService.getOrThrow('PAYMENTS_CREDIT_PACKS')),
        },
        {
            provide: CHECKOUT_REDIRECT_POLICY,
            inject: [ConfigService],
            useFactory: (configService: ConfigService<PaymentConfiguration, true>) =>
                new ConfiguredCheckoutRedirectPolicy(
                    resolveCheckoutAllowedOrigins({
                        provider: configService.getOrThrow('PAYMENTS_PROVIDER'),
                        checkoutUrl: configService.getOrThrow('PAYMENTS_CHECKOUT_URL'),
                        allowedOrigins: configService.get('PAYMENTS_CHECKOUT_ALLOWED_ORIGINS'),
                    }),
                ),
        },
        {
            provide: CreditPurchaseService,
            inject: [
                PAYMENT_PURCHASE_STORE,
                CreditPackCatalog,
                PAYMENT_PROVIDER,
                ConfigService,
                CHECKOUT_REDIRECT_POLICY,
            ],
            useFactory: (
                store: PaymentPurchaseStore,
                catalog: CreditPackCatalog,
                provider: PaymentProvider,
                configService: ConfigService<PaymentConfiguration, true>,
                redirectPolicy: CheckoutRedirectPolicy,
            ) =>
                new CreditPurchaseService(
                    store,
                    catalog,
                    provider,
                    configService.getOrThrow('PAYMENTS_PROVIDER'),
                    configService.getOrThrow('PAYMENTS_CHECKOUT_URL'),
                    redirectPolicy,
                ),
        },
        {
            provide: PaymentAdjustmentHandler,
            inject: [PAYMENT_ADJUSTMENT_STORE, CreditsService],
            useFactory: (adjustments: PaymentAdjustmentStore, credits: CreditsService) =>
                new PaymentAdjustmentHandler(adjustments, credits),
        },
        {
            provide: PaymentEventHandler,
            inject: [PAYMENT_PURCHASE_STORE, CreditsService, PaymentAdjustmentHandler, PAYMENT_EVENT_LOGGER],
            useFactory: (
                purchases: PaymentPurchaseStore,
                credits: CreditsService,
                adjustmentHandler: PaymentAdjustmentHandler,
                log: PaymentEventLogger,
            ) => new PaymentEventHandler(purchases, credits, adjustmentHandler, log),
        },
        {
            provide: PAYMENT_PROVIDER,
            inject: [ConfigService],
            useFactory: (configService: ConfigService<PaymentConfiguration, true>): PaymentProvider => {
                const provider = configService.getOrThrow<PaymentsProviderName>('PAYMENTS_PROVIDER')

                if (provider === PaymentsProviderName.STUB) {
                    return new StubPaymentProvider(configService.getOrThrow('PAYMENTS_STUB_WEBHOOK_SECRET'))
                }

                if (provider === PaymentsProviderName.PADDLE) {
                    const { client, webhookSecret } = createPaddleProviderDependencies({
                        apiKey: configService.getOrThrow('PADDLE_API_KEY'),
                        webhookSecret: configService.getOrThrow('PADDLE_WEBHOOK_SECRET'),
                        environment: configService.getOrThrow('PADDLE_ENVIRONMENT'),
                    })
                    return new PaddlePaymentProvider(client, webhookSecret)
                }

                throw new Error('Unsupported payment provider')
            },
        },
    ],
    exports: [CreditPackCatalog, CreditPurchaseService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
