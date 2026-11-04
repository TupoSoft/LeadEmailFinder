import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import {
    BETTER_AUTH_RUNTIME,
    BetterAuthRuntime,
    BetterAuthRuntimeModule,
} from '@tuposoft/lead-email-finder/better-auth'
import { AUTH_IDENTITY_ISSUER } from '@tuposoft/lead-email-finder/modules/identity'
import {
    NativeFixtureMetadata,
    NativeFixtureSeedError,
    parseNativeFixtureMetadata,
    seedNativeFixtures,
} from './native-fixtures'

// Run through `corepack pnpm auth:seed -- --native-only`, which compiles this file and executes it with Node.
// Ownership comes from current Docker labels, never from cached metadata or caller-supplied endpoints.

interface OwnedStack {
    checkoutRoot: string
    composeProject: string
    apiUrl: string
    postgresUrl: string
}

interface DevelopmentStackModule {
    loadDevelopmentStack(checkoutRoot: string, options: { persistMetadata: boolean }): OwnedStack
    inspectAuthMail(
        checkoutRoot: string,
        ownership: { checkoutRoot: string; composeProject: string },
    ): {
        smtpPort: number
    }
    assertCheckoutPrivateFile(checkoutRoot: string, relativePath: string): string
}

const METADATA = '.dev/auth/native-users.json'
const SECRET = '.dev/auth/better-auth-secret.txt'

function checkoutRoot(): string {
    const root = realpathSync(process.cwd())
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { name?: string }
    if (manifest.name !== '@tuposoft/lead-email-finder') {
        throw new NativeFixtureSeedError('Run the native seed from the LeadEmailFinder checkout root')
    }
    return root
}

function writePrivate(file: string, contents: string): void {
    mkdirSync(resolve(file, '..'), { recursive: true, mode: 0o700 })
    writeFileSync(file, contents, { mode: 0o600 })
    chmodSync(file, 0o600)
}

/** A checkout-owned, ignored runtime secret; generated once and reused so encrypted TOTP data stays readable. */
function developmentSecret(stack: DevelopmentStackModule, root: string): string {
    const file = stack.assertCheckoutPrivateFile(root, SECRET)
    if (!existsSync(file)) writePrivate(file, `${randomBytes(48).toString('base64url')}\n`)
    return readFileSync(file, 'utf8').trim()
}

async function main(args: string[]): Promise<void> {
    if (args.length !== 1 || args[0] !== '--native-only') {
        throw new NativeFixtureSeedError('Usage: corepack pnpm auth:seed -- --native-only')
    }
    const root = checkoutRoot()
    const stackModule = createRequire(resolve(root, 'package.json'))(
        './scripts/testing/development-stack.mjs',
    ) as DevelopmentStackModule
    const stack = stackModule.loadDevelopmentStack(root, { persistMetadata: false })
    const mail = stackModule.inspectAuthMail(root, stack)
    const metadataPath = stackModule.assertCheckoutPrivateFile(root, METADATA)
    const previous = existsSync(metadataPath)
        ? parseNativeFixtureMetadata(
              JSON.parse(readFileSync(metadataPath, 'utf8')) as unknown,
              root,
              stack.composeProject,
              AUTH_IDENTITY_ISSUER,
          )
        : undefined

    const settings: Record<string, string> = {
        NODE_ENV: 'development',
        BETTER_AUTH_SECRET: developmentSecret(stackModule, root),
        APP_BASE_URL: stack.apiUrl,
        POSTGRES_URL: stack.postgresUrl,
        AUTH_MAIL_SMTP_HOST: '127.0.0.1',
        AUTH_MAIL_SMTP_PORT: String(mail.smtpPort),
        AUTH_MAIL_FROM: 'Lead Email Finder <no-reply@lef.test>',
    }

    @Module({
        imports: [
            ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, skipProcessEnv: true, load: [() => settings] }),
            TypeOrmModule.forRoot({
                type: 'postgres',
                url: stack.postgresUrl,
                autoLoadEntities: true,
                synchronize: true,
            }),
            BetterAuthRuntimeModule,
        ],
    })
    class NativeSeedModule {}

    const app = await NestFactory.createApplicationContext(NativeSeedModule, { logger: ['error', 'warn'] })
    let metadata: NativeFixtureMetadata
    try {
        const runtime = app.get<BetterAuthRuntime>(BETTER_AUTH_RUNTIME)
        const dataSource = app.get(DataSource)
        const context = await runtime.auth.$context
        metadata = await seedNativeFixtures(
            {
                ensureUnverifiedByEmail: email => runtime.provisioner.ensureUnverifiedByEmail(email),
                readNativeUser: async email => {
                    const found = await context.internalAdapter.findUserByEmail(email)
                    return found ? { id: found.user.id, emailVerified: found.user.emailVerified } : undefined
                },
                query: (text, values) => dataSource.query(text, values),
            },
            { checkoutRoot: root, composeProject: stack.composeProject, issuer: AUTH_IDENTITY_ISSUER, previous },
        )
    } finally {
        await app.close()
    }
    stackModule.assertCheckoutPrivateFile(root, METADATA)
    writePrivate(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
    process.stdout.write(
        `Seeded ${metadata.users.length} native fixture users without memberships or credits; metadata: ${METADATA}\n`,
    )
}

if (require.main === module) {
    main(process.argv.slice(2).filter(arg => arg !== '--')).catch((error: unknown) => {
        // Controlled messages only; driver and ownership errors may embed connection strings.
        const safe =
            error instanceof NativeFixtureSeedError ||
            (error instanceof Error &&
                /^(Development |Expected exactly one running development service)/.test(error.message))
        process.stderr.write(`${safe ? (error as Error).message : 'Native fixture seed failed'}\n`)
        process.exitCode = 1
    })
}
