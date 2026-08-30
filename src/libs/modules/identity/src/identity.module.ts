import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExternalIdentityResolver } from './application/external-identity-resolver.service'
import { ACTIVE_MEMBERSHIP_READER } from './application/ports/active-membership-reader'
import { ACTIVE_SERVICE_CREDENTIAL_READER } from './application/ports/active-service-credential-reader'
import { CREDIT_LEDGER_STORE } from './application/ports/credit-ledger-store'
import { EXTERNAL_IDENTITY_STORE, ExternalIdentityStore } from './application/ports/external-identity-store'
import { INVITATION_ACCEPTANCE_STORE } from './application/ports/invitation-acceptance-store'
import { INVITATION_STORE } from './application/ports/invitation-store'
import { MEMBERSHIP_DIRECTORY } from './application/ports/membership-directory'
import { MEMBERSHIP_MUTATION_STORE } from './application/ports/membership-mutation-store'
import { ORGANIZATION_REGISTRATION_STORE } from './application/ports/organization-registration-store'
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
import { TypeOrmCreditLedgerStore } from './infrastructure/persistence/typeorm-credit-ledger-store'
import { TypeOrmExternalIdentityStore } from './infrastructure/persistence/typeorm-external-identity-store'
import { TypeOrmInvitationAcceptanceStore } from './infrastructure/persistence/typeorm-invitation-acceptance-store'
import { TypeOrmInvitationStore } from './infrastructure/persistence/typeorm-invitation-store'
import { TypeOrmMembershipDirectory } from './infrastructure/persistence/typeorm-membership-directory'
import { TypeOrmMembershipMutationStore } from './infrastructure/persistence/typeorm-membership-mutation-store'
import { TypeOrmOrganizationRegistrationStore } from './infrastructure/persistence/typeorm-organization-registration-store'

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
        TypeOrmExternalIdentityStore,
        TypeOrmActiveMembershipReader,
        TypeOrmActiveServiceCredentialReader,
        TypeOrmCreditLedgerStore,
        TypeOrmOrganizationRegistrationStore,
        TypeOrmInvitationStore,
        TypeOrmInvitationAcceptanceStore,
        TypeOrmMembershipDirectory,
        TypeOrmMembershipMutationStore,
        { provide: EXTERNAL_IDENTITY_STORE, useExisting: TypeOrmExternalIdentityStore },
        { provide: ACTIVE_MEMBERSHIP_READER, useExisting: TypeOrmActiveMembershipReader },
        { provide: ACTIVE_SERVICE_CREDENTIAL_READER, useExisting: TypeOrmActiveServiceCredentialReader },
        { provide: CREDIT_LEDGER_STORE, useExisting: TypeOrmCreditLedgerStore },
        { provide: ORGANIZATION_REGISTRATION_STORE, useExisting: TypeOrmOrganizationRegistrationStore },
        { provide: INVITATION_STORE, useExisting: TypeOrmInvitationStore },
        { provide: INVITATION_ACCEPTANCE_STORE, useExisting: TypeOrmInvitationAcceptanceStore },
        { provide: MEMBERSHIP_DIRECTORY, useExisting: TypeOrmMembershipDirectory },
        { provide: MEMBERSHIP_MUTATION_STORE, useExisting: TypeOrmMembershipMutationStore },
        {
            provide: ExternalIdentityResolver,
            inject: [EXTERNAL_IDENTITY_STORE],
            useFactory: (store: ExternalIdentityStore) => new ExternalIdentityResolver(store),
        },
    ],
    exports: [
        TypeOrmModule,
        EXTERNAL_IDENTITY_STORE,
        ACTIVE_MEMBERSHIP_READER,
        ACTIVE_SERVICE_CREDENTIAL_READER,
        CREDIT_LEDGER_STORE,
        ORGANIZATION_REGISTRATION_STORE,
        INVITATION_STORE,
        INVITATION_ACCEPTANCE_STORE,
        MEMBERSHIP_DIRECTORY,
        MEMBERSHIP_MUTATION_STORE,
        ExternalIdentityResolver,
    ],
})
export class IdentityModule {}
