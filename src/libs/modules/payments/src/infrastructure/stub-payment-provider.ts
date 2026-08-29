import { createHmac, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { PaymentConfiguration } from '../payment-configuration'
import {
    CheckoutInput,
    CheckoutResult,
    InvalidPaymentSignatureError,
    PaymentEvent,
    PaymentProvider,
} from '../payment-provider'

@Injectable()
export class StubPaymentProvider implements PaymentProvider {
    private readonly webhookSecret: string

    constructor(configService: ConfigService<PaymentConfiguration, true>) {
        this.webhookSecret = configService.getOrThrow('PAYMENTS_STUB_WEBHOOK_SECRET')
    }

    createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
        const providerReference = `stub_${input.purchaseId}`
        const redirectUrl = new URL(input.returnUrl)
        redirectUrl.searchParams.set('purchaseId', input.purchaseId)
        redirectUrl.searchParams.set('providerReference', providerReference)

        return Promise.resolve({ providerReference, redirectUrl: redirectUrl.toString() })
    }

    parseEvent(rawBody: Buffer, signature: string): Promise<PaymentEvent> {
        return Promise.resolve().then(() => {
            this.verifySignature(rawBody, signature)

            const payload: unknown = JSON.parse(rawBody.toString('utf8'))
            if (!isRecord(payload) || typeof payload['providerEventId'] !== 'string') {
                throw new Error('Invalid stub payment event')
            }

            if (
                payload['kind'] === 'purchase_adjustment_debit' ||
                payload['kind'] === 'purchase_adjustment_restore'
            ) {
                return this.parseAdjustment(payload)
            }

            if (payload['kind'] !== 'purchase_paid' && payload['kind'] !== 'purchase_failed') {
                return { kind: 'ignored', providerEventId: payload['providerEventId'] }
            }

            if (typeof payload['providerReference'] !== 'string') {
                throw new Error('Invalid stub payment event')
            }

            return {
                kind: payload['kind'],
                providerEventId: payload['providerEventId'],
                providerReference: payload['providerReference'],
                purchaseId: typeof payload['purchaseId'] === 'string' ? payload['purchaseId'] : undefined,
            }
        })
    }

    private parseAdjustment(payload: Record<string, unknown>): PaymentEvent {
        if (
            typeof payload['providerReference'] !== 'string' ||
            typeof payload['providerAdjustmentId'] !== 'string' ||
            !Number.isSafeInteger(payload['amountMinor']) ||
            (payload['amountMinor'] as number) < 0 ||
            typeof payload['currency'] !== 'string' ||
            !/^[A-Z]{3}$/.test(payload['currency'])
        ) {
            throw new Error('Invalid stub payment adjustment event')
        }

        return {
            kind: payload['kind'] as 'purchase_adjustment_debit' | 'purchase_adjustment_restore',
            providerEventId: payload['providerEventId'] as string,
            providerReference: payload['providerReference'],
            providerAdjustmentId: payload['providerAdjustmentId'],
            amountMinor: payload['amountMinor'] as number,
            currency: payload['currency'],
        }
    }

    private verifySignature(rawBody: Buffer, signature: string): void {
        const expected = Buffer.from(createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex'))
        const received = Buffer.from(signature)

        if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
            throw new InvalidPaymentSignatureError()
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
