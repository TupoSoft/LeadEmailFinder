import { Module, Type } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    AuditLogEntry,
    CREDIT_RESERVATION_STORE,
    CreditDebit,
    CreditGrant,
    CreditReservation,
    CreditReservationStore,
    ExternalIdentity,
    IdentityModule,
    Organization,
    OrganizationCreditAccount,
    OrganizationInvitation,
    OrganizationMembership,
    ServiceCredential,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'

// The full identity entity set: IdentityModule's own TypeOrmModule.forFeature registers repositories for all
// ten, so the root connection built for the module below must already know all ten or repository resolution
// fails with a "no metadata found" error.
const identityEntities = [
    Organization,
    ExternalIdentity,
    OrganizationMembership,
    ServiceCredential,
    OrganizationCreditAccount,
    CreditDebit,
    CreditGrant,
    CreditReservation,
    OrganizationInvitation,
    AuditLogEntry,
]

/** A fresh, uniquely decorated class per call: Nest module metadata is fixed at decoration time, so the real
 *  postgresUrl (known only once the checkout-owned stack metadata loads) must close over the class body. */
export function createReservationBootstrapModule(postgresUrl: string): Type<unknown> {
    @Module({
        imports: [
            TypeOrmModule.forRoot({
                type: 'postgres',
                url: postgresUrl,
                synchronize: false,
                entities: identityEntities,
            }),
            IdentityModule,
        ],
        providers: [
            {
                provide: CreditReservationService,
                useFactory: (store: CreditReservationStore) => new CreditReservationService(store),
                inject: [CREDIT_RESERVATION_STORE],
            },
        ],
        exports: [CreditReservationService],
    })
    class ReservationBootstrapModule {}
    return ReservationBootstrapModule
}
