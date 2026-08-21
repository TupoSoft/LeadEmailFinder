import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EnvironmentVariablesDto, PaymentsProviderName } from '../environment-variables.dto'
import { CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditPackCatalog } from './credit-pack-catalog'
import { CreditPurchaseController } from './credit-purchase.controller'
import { CreditPurchase } from './credit-purchase.entity'
import { CreditPurchaseService } from './credit-purchase.service'
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider'
import { StubPaymentProvider } from './infrastructure/stub-payment-provider'
import { PaymentEventHandler } from './payment-event.handler'
import { PaymentWebhookController } from './payment-webhook.controller'
import { PAYMENT_PURCHASE_STORE } from './payment-purchase.store'
import { TypeOrmPaymentPurchaseStore } from './infrastructure/typeorm-payment-purchase.store'
import { createPaddleProviderDependencies } from './infrastructure/paddle/paddle-client'
import { PaddlePaymentProvider } from './infrastructure/paddle/paddle-payment-provider'

@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([CreditPurchase]), CreditsModule, IdentityModule],
    controllers: [CreditPurchaseController, PaymentWebhookController],
    providers: [
        CreditPackCatalog,
        CreditPurchaseService,
        PaymentEventHandler,
        TypeOrmPaymentPurchaseStore,
        { provide: PAYMENT_PURCHASE_STORE, useExisting: TypeOrmPaymentPurchaseStore },
        RolePermissionPolicy,
        PermissionsGuard,
        StubPaymentProvider,
        {
            provide: PAYMENT_PROVIDER,
            inject: [ConfigService, StubPaymentProvider],
            useFactory: (
                configService: ConfigService<EnvironmentVariablesDto, true>,
                stubProvider: StubPaymentProvider,
            ): PaymentProvider => {
                const provider = configService.getOrThrow<PaymentsProviderName>('PAYMENTS_PROVIDER')

                if (provider === PaymentsProviderName.STUB) {
                    return stubProvider
                }

                if (provider === PaymentsProviderName.PADDLE) {
                    const { client, webhookSecret } = createPaddleProviderDependencies(configService)
                    return new PaddlePaymentProvider(client, webhookSecret)
                }

                throw new Error('Unsupported payment provider')
            },
        },
    ],
    exports: [CreditPackCatalog, CreditPurchaseService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
