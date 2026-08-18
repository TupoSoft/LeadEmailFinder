import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CreditDebit } from './infrastructure/persistence/credit-debit.entity'
import { CreditGrant } from './infrastructure/persistence/credit-grant.entity'
import { ExternalIdentity } from './infrastructure/persistence/external-identity.entity'
import { OrganizationCreditAccount } from './infrastructure/persistence/organization-credit-account.entity'
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
            CreditGrant,
        ]),
    ],
    exports: [TypeOrmModule],
})
export class IdentityModule {}
