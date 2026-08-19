import {
    BadRequestException,
    Controller,
    Headers,
    HttpCode,
    HttpStatus,
    Inject,
    Post,
    RawBodyRequest,
    Req,
    SerializeOptions,
} from '@nestjs/common'
import { Public } from '@tuposoft/lead-email-finder/modules/auth'
import { Expose } from 'class-transformer'
import type { Request } from 'express'
import { PaymentEventHandler } from './payment-event.handler'
import { InvalidPaymentSignatureError, PAYMENT_PROVIDER, PaymentProvider } from './payment-provider'

class PaymentWebhookAcknowledgementDto {
    @Expose()
    received: true
}

@Public()
@Controller('v1/payments')
export class PaymentWebhookController {
    constructor(
        @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
        private readonly eventHandler: PaymentEventHandler,
    ) {}

    @Post('webhook')
    @HttpCode(HttpStatus.OK)
    @SerializeOptions({ type: PaymentWebhookAcknowledgementDto })
    async receive(
        @Req() request: RawBodyRequest<Request>,
        @Headers('paddle-signature') signature?: string,
    ): Promise<{ received: true }> {
        if (!request.rawBody || !signature) {
            throw new BadRequestException('Missing payment webhook body or signature')
        }

        try {
            const event = await this.paymentProvider.parseEvent(request.rawBody, signature)
            await this.eventHandler.handle(event)
        } catch (error) {
            if (error instanceof InvalidPaymentSignatureError) {
                throw new BadRequestException(error.message)
            }
            throw error
        }

        return { received: true }
    }
}
