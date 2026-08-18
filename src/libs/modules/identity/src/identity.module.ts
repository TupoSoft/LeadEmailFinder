import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { HumanIdentityResolver } from './application/human-identity-resolver.service'
import { AuditLogEntry } from './infrastructure/persistence/audit-log-entry.entity'
import { CreditDebit } from './infrastructure/persistence/credit-debit.entity'
import { ExternalIdentity } from './infrastructure/persistence/external-identity.entity'
import { OrganizationCreditAccount } from './infrastructure/persistence/organization-credit-account.entity'
import { OrganizationInvitation } from './infrastructure/persistence/organization-invitation.entity'
import { OrganizationMembership } from './infrastructure/persistence/membership.entity'
import { Organization } from './infrastructure/persistence/organization.entity'
import { ServiceCredential } from './infrastructure/persistence/service-credential.entity'

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Organization,
            ExternalIdentity,
            OrganizationMembership,
            ServiceCredential,
            OrganizationCreditAccount,
            CreditDebit,
            OrganizationInvitation,
            AuditLogEntry,
        ]),
    ],
    providers: [HumanIdentityResolver],
    exports: [TypeOrmModule, HumanIdentityResolver],
})
export class IdentityModule {}
