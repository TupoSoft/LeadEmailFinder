import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
    AllocationEvent,
    ConnectionOutcomeEvent,
    IAllocationObserver,
    LeaseReleaseEvent,
} from '../../domain/allocation-observer.interface'

@Injectable()
export class StructuredLoggingAllocationObserver implements IAllocationObserver {
    @Inject(Logger)
    @Optional()
    private readonly logger = new Logger(StructuredLoggingAllocationObserver.name)

    onAllocation(event: AllocationEvent): void {
        if (event.outcome === 'acquired') {
            this.logger.log('Proxy allocation acquired', {
                outcome: event.outcome,
                proxyId: event.proxyId,
                proxyState: event.proxyState,
                durationMs: event.durationMs,
            })
            return
        }

        this.logger.warn('Proxy allocation exhausted', {
            outcome: event.outcome,
            durationMs: event.durationMs,
        })
    }

    onConnectionOutcome(event: ConnectionOutcomeEvent): void {
        const fields = {
            outcome: event.outcome,
            proxyId: event.proxyId,
            durationMs: event.durationMs,
        }

        if (event.outcome === 'connected') {
            this.logger.log('SMTP connection outcome', fields)
            return
        }

        this.logger.warn('SMTP connection outcome', fields)
    }

    onLeaseRelease(event: LeaseReleaseEvent): void {
        const fields = {
            outcome: event.outcome,
            proxyId: event.proxyId,
            durationMs: event.durationMs,
        }

        if (event.outcome === 'released') {
            this.logger.log('Proxy lease release outcome', fields)
            return
        }

        this.logger.warn('Proxy lease release outcome', fields)
    }
}
