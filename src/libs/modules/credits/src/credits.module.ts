import { Module } from '@nestjs/common'
import {
    CREDIT_LEDGER_STORE,
    CREDIT_RESERVATION_STORE,
    CreditLedgerStore,
    CreditReservationStore,
    IdentityModule,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from './application/credits.service'
import { CreditReservationService } from './application/credit-reservation.service'
import { CreditGuard } from './api/credits.guard'
import { CreditsController } from './api/credits.controller'
import { BillingSummaryController } from './api/billing-summary.controller'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'

@Module({
    imports: [IdentityModule],
    providers: [
        RolePermissionPolicy,
        PermissionsGuard,
        {
            provide: CreditsService,
            useFactory: (store: CreditLedgerStore) => new CreditsService(store),
            inject: [CREDIT_LEDGER_STORE],
        },
        {
            provide: CreditReservationService,
            useFactory: (store: CreditReservationStore) => new CreditReservationService(store),
            inject: [CREDIT_RESERVATION_STORE],
        },
        CreditGuard,
    ],
    controllers: [CreditsController, BillingSummaryController],
    exports: [CreditGuard, CreditsService, CreditReservationService],
})
export class CreditsModule {}
