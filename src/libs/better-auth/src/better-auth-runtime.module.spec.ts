import { MODULE_METADATA } from '@nestjs/common/constants'
import { ConfigService } from '@nestjs/config'
import { getDataSourceToken } from '@nestjs/typeorm'
import { BETTER_AUTH_CONFIGURATION } from './better-auth-configuration'
import { BETTER_AUTH_RUNTIME } from './better-auth-runtime'
import { BetterAuthRuntimeModule } from './better-auth-runtime.module'
import { AUTH_MAIL_DELIVERY } from './mail/auth-mail-delivery'
import { BETTER_AUTH_ENTITIES } from './persistence/better-auth-entities'
import { NATIVE_HUMAN_USER_PROVISIONER } from './provisioning/native-human-user-provisioner'

interface FactoryProvider {
    provide: unknown
    useFactory: (...args: unknown[]) => unknown
    inject?: unknown[]
}

function metadata<T>(key: string): T[] {
    return (Reflect.getMetadata(key, BetterAuthRuntimeModule) as T[] | undefined) ?? []
}

describe('BetterAuthRuntimeModule', () => {
    it('registers every mapped native table for TypeORM synchronization', () => {
        const imported = metadata<{ module?: { name: string }; providers?: unknown[] }>(MODULE_METADATA.IMPORTS)
        const forFeature = imported.find(candidate => candidate.module?.name === 'TypeOrmModule')
        expect(forFeature?.providers).toHaveLength(BETTER_AUTH_ENTITIES.length)
        expect(BETTER_AUTH_ENTITIES.map(entity => entity.name)).toEqual([
            'BetterAuthUserEntity',
            'BetterAuthSessionEntity',
            'BetterAuthAccountEntity',
            'BetterAuthVerificationEntity',
            'BetterAuthTwoFactorEntity',
        ])
    })

    it('starts the native runtime only after TypeORM synchronized the data source', () => {
        const provider = metadata<FactoryProvider>(MODULE_METADATA.PROVIDERS).find(
            candidate => candidate.provide === BETTER_AUTH_RUNTIME,
        )
        expect(provider?.inject).toEqual([BETTER_AUTH_CONFIGURATION, getDataSourceToken()])
    })

    it('exports only the runtime, mail delivery, and native user provisioner', () => {
        expect(metadata(MODULE_METADATA.EXPORTS)).toEqual([
            BETTER_AUTH_RUNTIME,
            AUTH_MAIL_DELIVERY,
            NATIVE_HUMAN_USER_PROVISIONER,
        ])
    })

    it('validates configuration only when the runtime is composed, without printing values', () => {
        const provider = metadata<FactoryProvider>(MODULE_METADATA.PROVIDERS).find(
            candidate => candidate.provide === BETTER_AUTH_CONFIGURATION,
        )
        const values: Record<string, string> = { BETTER_AUTH_SECRET: 'too-short-synthetic' }
        const config = { get: (name: string) => values[name] } as unknown as ConfigService

        expect(() => provider?.useFactory(config)).toThrow('BETTER_AUTH_SECRET: too-short')
        expect(() => provider?.useFactory(config)).not.toThrow(/too-short-synthetic/)
    })
})
