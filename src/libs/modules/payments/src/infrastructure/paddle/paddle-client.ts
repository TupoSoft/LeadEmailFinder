import { Environment, EventEntity, Paddle, Transaction } from '@paddle/paddle-node-sdk'
import { PaddleEnvironmentName } from '../../domain/payment-configuration'

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

export interface PaddleProviderConfiguration {
    readonly apiKey: string
    readonly webhookSecret: string
    readonly environment: string
}

export function createPaddleProviderDependencies(
    configuration: PaddleProviderConfiguration,
): PaddleProviderDependencies {
    const { apiKey, webhookSecret, environment } = configuration

    if (environment !== String(PaddleEnvironmentName.SANDBOX)) {
        throw new Error(`Unsupported Paddle environment: ${environment}`)
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
