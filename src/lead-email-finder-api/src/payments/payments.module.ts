import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EnvironmentVariablesDto, PaymentsProviderName } from '../environment-variables.dto'
import { CreditsModule } from '../credits/credits.module'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditPackCatalog } from './credit-pack-catalog'
import { CreditPurchaseController } from './credit-purchase.controller'
import { CreditPurchase } from './credit-purchase.entity'
import { CreditPurchaseService } from './credit-purchase.service'
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider'
import { StubPaymentProvider } from './infrastructure/stub-payment-provider'

@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([CreditPurchase]), CreditsModule, IdentityModule],
    controllers: [CreditPurchaseController],
    providers: [
        CreditPackCatalog,
        CreditPurchaseService,
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

                throw new Error(`Payment provider is not implemented: ${provider}`)
            },
        },
    ],
    exports: [CreditPackCatalog, CreditPurchaseService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
