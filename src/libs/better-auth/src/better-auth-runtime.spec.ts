import type { Pool } from 'pg'
import { BetterAuthConfiguration } from './better-auth-configuration'
import { openBetterAuthRuntime } from './better-auth-runtime'
import { AuthMailTransport } from './mail/smtp-auth-mail-delivery'
import { BetterAuthLibrary } from './native/better-auth-library'
import { NativeHumanUserProvisioner } from './provisioning/native-human-user-provisioner'

const configuration: BetterAuthConfiguration = {
    secret: 'synthetic-secret-value-that-is-long-enough',
    baseUrl: 'http://localhost:53000',
    databaseUrl: 'postgresql://postgres:synthetic@localhost:55432/lef',
    mail: { host: 'auth-mail', port: 1025, secure: false, requireTls: false, from: 'no-reply@lef.test' },
}

interface RuntimeResources {
    pool: jest.Mocked<Pool>
    mailTransport: jest.Mocked<AuthMailTransport>
    library: BetterAuthLibrary
    instance: object
}

function resources(): RuntimeResources {
    const pool = { end: jest.fn().mockResolvedValue(undefined), query: jest.fn() } as unknown as jest.Mocked<Pool>
    const mailTransport: jest.Mocked<AuthMailTransport> = { sendMail: jest.fn(), close: jest.fn() }
    const instance = { api: {} }
    const library = {
        betterAuth: jest.fn(() => instance),
        magicLink: jest.fn(() => ({ id: 'magic-link' })),
        twoFactor: jest.fn(() => ({ id: 'two-factor' })),
    } as unknown as BetterAuthLibrary
    return { pool, mailTransport, library, instance }
}

describe('openBetterAuthRuntime', () => {
    it('exposes one native instance with its provisioner and mail capability', async () => {
        const { pool, mailTransport, library, instance } = resources()
        const runtime = await openBetterAuthRuntime(configuration, { pool, mailTransport, library })

        expect(runtime.auth).toBe(instance)
        expect(runtime.provisioner).toBeInstanceOf(NativeHumanUserProvisioner)
        expect(library.betterAuth).toHaveBeenCalledTimes(1)
    })

    it('closes the pool and transport exactly once', async () => {
        const { pool, mailTransport, library } = resources()
        const runtime = await openBetterAuthRuntime(configuration, { pool, mailTransport, library })

        await Promise.all([runtime.close(), runtime.close()])
        await runtime.close()

        expect(pool.end).toHaveBeenCalledTimes(1)
        expect(mailTransport.close).toHaveBeenCalledTimes(1)
    })

    it('releases its resources when native construction fails', async () => {
        const { pool, mailTransport, library } = resources()
        ;(library.betterAuth as jest.Mock).mockImplementation(() => {
            throw new Error('schema mismatch')
        })

        await expect(openBetterAuthRuntime(configuration, { pool, mailTransport, library })).rejects.toThrow(
            'schema mismatch',
        )
        expect(pool.end).toHaveBeenCalledTimes(1)
        expect(mailTransport.close).toHaveBeenCalledTimes(1)
    })
})
