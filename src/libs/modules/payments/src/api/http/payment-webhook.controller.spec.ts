import { BadRequestException } from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { PaymentEventHandler } from '../../application/payment-event.handler'
import { PaymentProvider } from '../../application/ports/payment-provider'
import { InvalidPaymentSignatureError } from '../../domain/payment-event'
import { PaymentWebhookController } from './payment-webhook.controller'

describe('PaymentWebhookController', () => {
    let provider: jest.Mocked<Pick<PaymentProvider, 'parseEvent'>>
    let handler: jest.Mocked<Pick<PaymentEventHandler, 'handle'>>
    let controller: PaymentWebhookController
    const rawBody = Buffer.from('{"kind":"purchase_paid"}')
    const request = { rawBody } as RawBodyRequest<Request>

    beforeEach(() => {
        provider = { parseEvent: jest.fn() }
        handler = { handle: jest.fn() }
        controller = new PaymentWebhookController(
            provider as unknown as PaymentProvider,
            handler as unknown as PaymentEventHandler,
        )
    })

    it('parses, handles, and acknowledges a signed event', async () => {
        const event = {
            kind: 'purchase_paid' as const,
            providerEventId: 'event-1',
            providerReference: 'purchase-1',
            providerTotalMinor: 500,
            currency: 'USD',
        }
        provider.parseEvent.mockResolvedValue(event)

        await expect(controller.receive(request, 'signature')).resolves.toEqual({ received: true })
        expect(provider.parseEvent).toHaveBeenCalledWith(rawBody, 'signature')
        expect(handler.handle).toHaveBeenCalledWith(event)
    })

    it.each([
        [{}, 'signature'],
        [request, undefined],
    ])('rejects a missing raw body or signature', async (receivedRequest, signature) => {
        await expect(
            controller.receive(receivedRequest as RawBodyRequest<Request>, signature),
        ).rejects.toThrow(BadRequestException)
        expect(provider.parseEvent).not.toHaveBeenCalled()
    })

    it('maps an invalid provider signature to a bad request', async () => {
        provider.parseEvent.mockRejectedValue(new InvalidPaymentSignatureError())

        await expect(controller.receive(request, 'invalid')).rejects.toThrow(BadRequestException)
        expect(handler.handle).not.toHaveBeenCalled()
    })

    it('lets unexpected parsing failures surface for retry', async () => {
        provider.parseEvent.mockRejectedValue(new Error('malformed verified event'))

        await expect(controller.receive(request, 'signature')).rejects.toThrow('malformed verified event')
    })

    it('lets event-handling failures surface for provider retry', async () => {
        provider.parseEvent.mockResolvedValue({
            kind: 'purchase_paid',
            providerEventId: 'event-1',
            providerReference: 'purchase-1',
            providerTotalMinor: 500,
            currency: 'USD',
        })
        handler.handle.mockRejectedValue(new Error('credit grant unavailable'))

        await expect(controller.receive(request, 'signature')).rejects.toThrow('credit grant unavailable')
    })
})
