import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EnvironmentVariablesDto, PaymentsProviderName } from '../environment-variables.dto'
import { CreditPackCatalog } from './credit-pack-catalog'
import { CreditPurchase } from './credit-purchase.entity'
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider'
import { StubPaymentProvider } from './infrastructure/stub-payment-provider'

@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([CreditPurchase])],
    providers: [
        CreditPackCatalog,
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
    exports: [CreditPackCatalog, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
