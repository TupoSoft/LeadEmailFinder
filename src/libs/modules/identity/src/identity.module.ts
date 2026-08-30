import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExternalIdentityResolver } from './application/external-identity-resolver.service'
import { HumanIdentityResolver } from './application/human-identity-resolver.service'
import { ACTIVE_MEMBERSHIP_READER } from './application/ports/active-membership-reader'
import { ACTIVE_SERVICE_CREDENTIAL_READER } from './application/ports/active-service-credential-reader'
import { EXTERNAL_IDENTITY_STORE, ExternalIdentityStore } from './application/ports/external-identity-store'
import { AuditLogEntry } from './infrastructure/persistence/audit-log-entry.entity'
import { CreditDebit } from './infrastructure/persistence/credit-debit.entity'
import { CreditGrant } from './infrastructure/persistence/credit-grant.entity'
import { ExternalIdentity } from './infrastructure/persistence/external-identity.entity'
import { OrganizationCreditAccount } from './infrastructure/persistence/organization-credit-account.entity'
import { OrganizationInvitation } from './infrastructure/persistence/organization-invitation.entity'
import { OrganizationMembership } from './infrastructure/persistence/membership.entity'
import { Organization } from './infrastructure/persistence/organization.entity'
import { ServiceCredential } from './infrastructure/persistence/service-credential.entity'
import { TypeOrmActiveMembershipReader } from './infrastructure/persistence/typeorm-active-membership-reader'
import { TypeOrmActiveServiceCredentialReader } from './infrastructure/persistence/typeorm-active-service-credential-reader'
import { TypeOrmExternalIdentityStore } from './infrastructure/persistence/typeorm-external-identity-store'

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Organization,
            ExternalIdentity,
            OrganizationMembership,
            ServiceCredential,
            OrganizationCreditAccount,
            CreditDebit,
            CreditGrant,
            OrganizationInvitation,
            AuditLogEntry,
        ]),
    ],
    providers: [
        HumanIdentityResolver,
        TypeOrmExternalIdentityStore,
        TypeOrmActiveMembershipReader,
        TypeOrmActiveServiceCredentialReader,
        { provide: EXTERNAL_IDENTITY_STORE, useExisting: TypeOrmExternalIdentityStore },
        { provide: ACTIVE_MEMBERSHIP_READER, useExisting: TypeOrmActiveMembershipReader },
        { provide: ACTIVE_SERVICE_CREDENTIAL_READER, useExisting: TypeOrmActiveServiceCredentialReader },
        {
            provide: ExternalIdentityResolver,
            inject: [EXTERNAL_IDENTITY_STORE],
            useFactory: (store: ExternalIdentityStore) => new ExternalIdentityResolver(store),
        },
    ],
    exports: [
        TypeOrmModule,
        HumanIdentityResolver,
        EXTERNAL_IDENTITY_STORE,
        ACTIVE_MEMBERSHIP_READER,
        ACTIVE_SERVICE_CREDENTIAL_READER,
        ExternalIdentityResolver,
    ],
})
export class IdentityModule {}
