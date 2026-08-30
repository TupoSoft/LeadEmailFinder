import { Module } from '@nestjs/common'
import { CREDIT_LEDGER_STORE, CreditLedgerStore, IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from './application/credits.service'
import { CreditGuard } from './api/credits.guard'
import { CreditsController } from './api/credits.controller'
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
        CreditGuard,
    ],
    controllers: [CreditsController],
    exports: [CreditGuard, CreditsService],
})
export class CreditsModule {}
