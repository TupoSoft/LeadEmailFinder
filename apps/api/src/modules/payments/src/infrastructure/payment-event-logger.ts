import { Injectable, Logger } from '@nestjs/common'
import { PaymentEventLogger } from '../application/ports/payment-event-logger'

@Injectable()
export class NestPaymentEventLogger implements PaymentEventLogger {
    private readonly logger = new Logger('PaymentEventHandler')

    warnUnknownEvent(providerEventId: string, providerReference: string): void {
        this.logger.warn({
            message: 'Ignoring payment event for an unknown purchase',
            providerEventId,
            providerReference,
        })
    }

    errorConflict(providerEventId: string, providerReference: string, purchaseId: string): void {
        this.logger.error({
            message: 'Rejecting a payment event whose purchase is already bound to a different provider reference',
            providerEventId,
            providerReference,
            purchaseId,
        })
    }
}
