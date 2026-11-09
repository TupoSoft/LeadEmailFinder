import { MODULE_METADATA } from '@nestjs/common/constants'
import { CREDIT_LEDGER_STORE, CREDIT_RESERVATION_STORE } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule } from './credits.module'
import { CreditGuard } from './api/credits.guard'
import { CreditsService } from './application/credits.service'
import { CreditReservationService } from './application/credit-reservation.service'

describe('CreditsModule', () => {
    it('provides CreditsService via an explicit factory injecting the identity credit-ledger port', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CreditsModule) as Array<{
            provide?: unknown
            inject?: unknown[]
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: CreditsService, inject: [CREDIT_LEDGER_STORE] }),
            ]),
        )
        expect(providers).toEqual(expect.arrayContaining([RolePermissionPolicy, PermissionsGuard, CreditGuard]))
    })

    it('provides CreditReservationService via an explicit factory injecting the identity reservation port', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CreditsModule) as Array<{
            provide?: unknown
            inject?: unknown[]
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: CreditReservationService, inject: [CREDIT_RESERVATION_STORE] }),
            ]),
        )
    })

    it('exports CreditGuard, CreditsService, and CreditReservationService', () => {
        const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, CreditsModule) as unknown[]

        expect(exports).toEqual([CreditGuard, CreditsService, CreditReservationService])
    })
})
