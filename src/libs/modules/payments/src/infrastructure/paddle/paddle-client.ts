import { Environment, EventEntity, Paddle, Transaction } from '@paddle/paddle-node-sdk'
import { ConfigService } from '@nestjs/config'
import { PaddleEnvironmentName, PaymentConfiguration } from '../../payment-configuration'

export interface PaddleClient {
    readonly transactions: {
        create: Paddle['transactions']['create']
    }
    readonly webhooks: {
        unmarshal(requestBody: string, secretKey: string, signature: string): Promise<EventEntity>
    }
}

export interface PaddleProviderDependencies {
    readonly client: PaddleClient
    readonly webhookSecret: string
}

export function createPaddleProviderDependencies(
    configService: ConfigService<PaymentConfiguration, true>,
): PaddleProviderDependencies {
    const apiKey = configService.getOrThrow<string>('PADDLE_API_KEY')
    const webhookSecret = configService.getOrThrow<string>('PADDLE_WEBHOOK_SECRET')
    const configuredEnvironment = configService.getOrThrow<string>('PADDLE_ENVIRONMENT')

    if (configuredEnvironment !== String(PaddleEnvironmentName.SANDBOX)) {
        throw new Error(`Unsupported Paddle environment: ${configuredEnvironment}`)
    }

    const paddle = new Paddle(apiKey, { environment: Environment.sandbox })

    return {
        client: {
            transactions: {
                create: (parameters, queryParameters): Promise<Transaction> =>
                    paddle.transactions.create(parameters, queryParameters),
            },
            webhooks: paddle.webhooks,
        },
        webhookSecret,
    }
}
