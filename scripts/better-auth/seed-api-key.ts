import { createHash, randomBytes } from 'node:crypto'
import { unlinkSync } from 'node:fs'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import {
    ACTIVE_SERVICE_CREDENTIAL_READER,
    ActiveServiceCredentialReader,
    AUTH_PERMISSIONS,
    AuthPrincipal,
    IdentityModule,
    Organization,
    SERVICE_CREDENTIAL_DIRECTORY,
    SERVICE_CREDENTIAL_WRITER,
    ServiceCredentialDirectory,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    ApiKeyFixtureKind,
    assertApiKeyFixtureCredential,
    parseApiKeyFixture,
    seedApiKeyFixture,
} from './api-key-fixtures'

interface OwnedStack {
    checkoutRoot: string
    composeProject: string
    postgresUrl: string
}
interface StackTools {
    loadDevelopmentStack(root: string, options: { persistMetadata: boolean }): OwnedStack
    assertCheckoutPrivateFile(root: string, path: string): string
}

async function main(args: string[]): Promise<void> {
    const [kind, organizationId, operation] = args
    if (
        !['platform', 'customer', 'mcp-live'].includes(kind) ||
        args.length !== (kind === 'platform' ? 1 : kind === 'mcp-live' && operation ? 3 : 2) ||
        (kind !== 'platform' && !/^[0-9a-f-]{36}$/.test(organizationId ?? '')) ||
        (operation && (kind !== 'mcp-live' || !['rotate', 'disable', 'delete'].includes(operation)))
    ) {
        throw new Error(
            'Usage: auth tool seed-api-key platform | customer <organization-id> | mcp-live <organization-id>',
        )
    }
    const root = realpathSync(process.cwd())
    const stackTools = createRequire(resolve(root, 'package.json'))(
        './scripts/testing/development-stack.mjs',
    ) as StackTools
    const stack = stackTools.loadDevelopmentStack(root, { persistMetadata: false })
    const relativeFile = `.dev/auth/${kind}-api-key.json`
    const file = stackTools.assertCheckoutPrivateFile(root, relativeFile)
    const previous = existsSync(file)
        ? parseApiKeyFixture(
              JSON.parse(readFileSync(file, 'utf8')) as unknown,
              root,
              stack.composeProject,
              kind as ApiKeyFixtureKind,
          )
        : undefined
    @Module({
        imports: [
            TypeOrmModule.forRoot({
                type: 'postgres',
                url: stack.postgresUrl,
                autoLoadEntities: true,
                synchronize: false,
            }),
            IdentityModule,
        ],
    })
    class ApiKeySeedModule {}
    const app = await NestFactory.createApplicationContext(ApiKeySeedModule, { logger: false })
    try {
        let targetOrganizationId = organizationId
        if (kind === 'platform') {
            const organizations = app.get(DataSource).getRepository(Organization)
            let organization = await organizations.findOneBy({ name: 'Platform Operations (development)' })
            if (!organization)
                organization = await organizations.save(
                    organizations.create({ name: 'Platform Operations (development)' }),
                )
            targetOrganizationId = organization.id
        }
        if (operation) {
            if (!previous || previous.organizationId !== targetOrganizationId)
                throw new Error('MCP fixture metadata is missing')
            const directory = app.get<ServiceCredentialDirectory>(SERVICE_CREDENTIAL_DIRECTORY)
            const writer = app.get<ServiceCredentialWriter>(SERVICE_CREDENTIAL_WRITER)
            const credential = await directory.findByIdForOrganization(previous.credentialId, previous.organizationId)
            if (!credential) throw new Error('MCP fixture credential is missing')
            assertApiKeyFixtureCredential(previous, credential, 'mcp-live')
            const actor: AuthPrincipal = {
                credentialKind: 'human_session',
                issuer: previous.issuer,
                subject: 'development-bootstrap',
                organizationId: previous.organizationId,
                membershipRole: 'platform_admin',
                permissions: AUTH_PERMISSIONS,
                credentialId: 'development-bootstrap',
            }
            if (operation === 'rotate') {
                const apiKey = `lef_${randomBytes(32).toString('base64url')}`
                const outcome = await writer.rotateWithAudit(credential, actor, {
                    keyHash: createHash('sha256').update(apiKey).digest('hex'),
                    keyPrefix: apiKey.slice(0, 12),
                })
                if (outcome.kind !== 'rotated') throw new Error('MCP fixture rotation failed')
                writeFileSync(
                    file,
                    `${JSON.stringify({ ...previous, apiKey, keyPrefix: apiKey.slice(0, 12) }, null, 2)}\n`,
                    { mode: 0o600 },
                )
            } else if (operation === 'disable') {
                if ((await writer.disableWithAudit(credential, actor)) === 'not-found')
                    throw new Error('MCP fixture disable failed')
            } else {
                if ((await writer.deleteWithAudit(credential, actor)) !== 'deleted')
                    throw new Error('MCP fixture deletion failed')
                stackTools.assertCheckoutPrivateFile(root, relativeFile)
                unlinkSync(file)
            }
            return
        }
        const fixture = await seedApiKeyFixture(
            {
                reader: app.get<ActiveServiceCredentialReader>(ACTIVE_SERVICE_CREDENTIAL_READER),
                directory: app.get<ServiceCredentialDirectory>(SERVICE_CREDENTIAL_DIRECTORY),
                writer: app.get<ServiceCredentialWriter>(SERVICE_CREDENTIAL_WRITER),
            },
            {
                checkoutRoot: root,
                composeProject: stack.composeProject,
                organizationId: targetOrganizationId,
                kind: kind as 'platform' | 'customer' | 'mcp-live',
                previous,
            },
        )
        stackTools.assertCheckoutPrivateFile(root, relativeFile)
        mkdirSync(resolve(file, '..'), { recursive: true, mode: 0o700 })
        writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`, { mode: 0o600 })
        chmodSync(file, 0o600)
        process.stdout.write(`Seeded ${kind} API-key fixture; private metadata: ${relativeFile}\n`)
    } finally {
        await app.close()
    }
}

if (require.main === module)
    main(process.argv.slice(2).filter(arg => arg !== '--')).catch(() => {
        process.stderr.write('API-key fixture seed failed; raw output withheld to protect credentials\n')
        process.exitCode = 1
    })
