import { createHmac } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { EnvironmentVariablesDto } from '../../environment-variables.dto'
import { CreditPack } from '../credit-pack-catalog'
import { paymentProviderContract } from '../payment-provider.contract'
import { StubPaymentProvider } from './stub-payment-provider'

const webhookSecret = 'contract-test-secret'

function createProvider(): StubPaymentProvider {
    const configService = {
        getOrThrow: jest.fn().mockReturnValue(webhookSecret),
    } as unknown as ConfigService<EnvironmentVariablesDto, true>

    return new StubPaymentProvider(configService)
}

function sign(rawBody: Buffer): string {
    return createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
}

paymentProviderContract('StubPaymentProvider', { createProvider, sign })

describe('StubPaymentProvider', () => {
    it('creates a deterministic local checkout', async () => {
        const pack: CreditPack = {
            id: 'starter',
            credits: 100,
            amountMinor: 500,
            currency: 'USD',
            providerPriceId: 'price_starter',
        }

        await expect(
            createProvider().createCheckout({
                purchaseId: 'purchase-id',
                organizationId: 'organization-id',
                pack,
                returnUrl: 'http://localhost:53000/billing/complete',
            }),
        ).resolves.toEqual({
            providerReference: 'stub_purchase-id',
            redirectUrl:
                'http://localhost:53000/billing/complete?purchaseId=purchase-id&providerReference=stub_purchase-id',
        })
    })
})
