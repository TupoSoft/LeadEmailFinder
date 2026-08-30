import { MODULE_METADATA } from '@nestjs/common/constants'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExternalIdentityResolver } from './application/external-identity-resolver.service'
import { HumanIdentityResolver } from './application/human-identity-resolver.service'
import { ACTIVE_MEMBERSHIP_READER } from './application/ports/active-membership-reader'
import { ACTIVE_SERVICE_CREDENTIAL_READER } from './application/ports/active-service-credential-reader'
import { CREDIT_LEDGER_STORE } from './application/ports/credit-ledger-store'
import { EXTERNAL_IDENTITY_STORE } from './application/ports/external-identity-store'
import { IdentityModule } from './identity.module'
import { TypeOrmActiveMembershipReader } from './infrastructure/persistence/typeorm-active-membership-reader'
import { TypeOrmActiveServiceCredentialReader } from './infrastructure/persistence/typeorm-active-service-credential-reader'
import { TypeOrmCreditLedgerStore } from './infrastructure/persistence/typeorm-credit-ledger-store'
import { TypeOrmExternalIdentityStore } from './infrastructure/persistence/typeorm-external-identity-store'

describe('IdentityModule', () => {
    it('binds each new port to its TypeORM adapter and provides the resolver via a factory', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IdentityModule) as Array<{
            provide?: symbol | (new (...args: never[]) => unknown)
            useExisting?: unknown
            useFactory?: unknown
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: EXTERNAL_IDENTITY_STORE, useExisting: TypeOrmExternalIdentityStore }),
                expect.objectContaining({ provide: ACTIVE_MEMBERSHIP_READER, useExisting: TypeOrmActiveMembershipReader }),
                expect.objectContaining({
                    provide: ACTIVE_SERVICE_CREDENTIAL_READER,
                    useExisting: TypeOrmActiveServiceCredentialReader,
                }),
                expect.objectContaining({ provide: CREDIT_LEDGER_STORE, useExisting: TypeOrmCreditLedgerStore }),
                expect.objectContaining({ provide: ExternalIdentityResolver }),
            ]),
        )
        expect(providers).toEqual(expect.arrayContaining([HumanIdentityResolver]))
    })

    it('keeps every existing export while adding the three new tokens and the resolver', () => {
        const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, IdentityModule) as unknown[]

        expect(exports).toEqual(
            expect.arrayContaining([
                TypeOrmModule,
                HumanIdentityResolver,
                EXTERNAL_IDENTITY_STORE,
                ACTIVE_MEMBERSHIP_READER,
                ACTIVE_SERVICE_CREDENTIAL_READER,
                CREDIT_LEDGER_STORE,
                ExternalIdentityResolver,
            ]),
        )
    })
})
