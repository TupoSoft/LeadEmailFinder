import { MODULE_METADATA } from '@nestjs/common/constants'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExternalIdentityResolver } from './application/external-identity-resolver.service'
import { ACTIVE_MEMBERSHIP_READER } from './application/ports/active-membership-reader'
import { ACTIVE_SERVICE_CREDENTIAL_READER } from './application/ports/active-service-credential-reader'
import { CREDIT_LEDGER_STORE } from './application/ports/credit-ledger-store'
import { EXTERNAL_IDENTITY_STORE } from './application/ports/external-identity-store'
import { INVITATION_ACCEPTANCE_STORE } from './application/ports/invitation-acceptance-store'
import { INVITATION_STORE } from './application/ports/invitation-store'
import { MEMBERSHIP_DIRECTORY } from './application/ports/membership-directory'
import { MEMBERSHIP_MUTATION_STORE } from './application/ports/membership-mutation-store'
import { ORGANIZATION_REGISTRATION_STORE } from './application/ports/organization-registration-store'
import { SERVICE_CREDENTIAL_DIRECTORY } from './application/ports/service-credential-directory'
import { SERVICE_CREDENTIAL_WRITER } from './application/ports/service-credential-writer'
import { IdentityModule } from './identity.module'
import { TypeOrmActiveMembershipReader } from './infrastructure/persistence/typeorm-active-membership-reader'
import { TypeOrmActiveServiceCredentialReader } from './infrastructure/persistence/typeorm-active-service-credential-reader'
import { TypeOrmCreditLedgerStore } from './infrastructure/persistence/typeorm-credit-ledger-store'
import { TypeOrmExternalIdentityStore } from './infrastructure/persistence/typeorm-external-identity-store'
import { TypeOrmInvitationAcceptanceStore } from './infrastructure/persistence/typeorm-invitation-acceptance-store'
import { TypeOrmInvitationStore } from './infrastructure/persistence/typeorm-invitation-store'
import { TypeOrmMembershipDirectory } from './infrastructure/persistence/typeorm-membership-directory'
import { TypeOrmMembershipMutationStore } from './infrastructure/persistence/typeorm-membership-mutation-store'
import { TypeOrmOrganizationRegistrationStore } from './infrastructure/persistence/typeorm-organization-registration-store'
import { TypeOrmServiceCredentialDirectory } from './infrastructure/persistence/typeorm-service-credential-directory'
import { TypeOrmServiceCredentialWriter } from './infrastructure/persistence/typeorm-service-credential-writer'

describe('IdentityModule', () => {
    it('binds each port to its TypeORM adapter and provides the resolver via a factory', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IdentityModule) as Array<{
            provide?: symbol | (new (...args: never[]) => unknown)
            useExisting?: unknown
            useFactory?: unknown
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    provide: EXTERNAL_IDENTITY_STORE,
                    useExisting: TypeOrmExternalIdentityStore,
                }),
                expect.objectContaining({
                    provide: ACTIVE_MEMBERSHIP_READER,
                    useExisting: TypeOrmActiveMembershipReader,
                }),
                expect.objectContaining({
                    provide: ACTIVE_SERVICE_CREDENTIAL_READER,
                    useExisting: TypeOrmActiveServiceCredentialReader,
                }),
                expect.objectContaining({ provide: CREDIT_LEDGER_STORE, useExisting: TypeOrmCreditLedgerStore }),
                expect.objectContaining({
                    provide: ORGANIZATION_REGISTRATION_STORE,
                    useExisting: TypeOrmOrganizationRegistrationStore,
                }),
                expect.objectContaining({ provide: INVITATION_STORE, useExisting: TypeOrmInvitationStore }),
                expect.objectContaining({
                    provide: INVITATION_ACCEPTANCE_STORE,
                    useExisting: TypeOrmInvitationAcceptanceStore,
                }),
                expect.objectContaining({ provide: MEMBERSHIP_DIRECTORY, useExisting: TypeOrmMembershipDirectory }),
                expect.objectContaining({
                    provide: MEMBERSHIP_MUTATION_STORE,
                    useExisting: TypeOrmMembershipMutationStore,
                }),
                expect.objectContaining({
                    provide: SERVICE_CREDENTIAL_DIRECTORY,
                    useExisting: TypeOrmServiceCredentialDirectory,
                }),
                expect.objectContaining({
                    provide: SERVICE_CREDENTIAL_WRITER,
                    useExisting: TypeOrmServiceCredentialWriter,
                }),
                expect.objectContaining({ provide: ExternalIdentityResolver }),
            ]),
        )
    })

    it('keeps every compatibility export while exposing all application tokens', () => {
        const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, IdentityModule) as unknown[]

        expect(exports).toEqual(
            expect.arrayContaining([
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
                SERVICE_CREDENTIAL_DIRECTORY,
                SERVICE_CREDENTIAL_WRITER,
                ExternalIdentityResolver,
            ]),
        )
    })
})
