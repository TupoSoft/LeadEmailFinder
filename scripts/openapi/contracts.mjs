import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import openapiTS, { astToString } from 'openapi-typescript'
import ts from 'typescript'

const require = createRequire(import.meta.url)
export const rootDirectory = fileURLToPath(new URL('../../', import.meta.url))
export const snapshotPath = resolve(rootDirectory, 'packages/api-client/openapi/lead-email-finder.json')
export const schemaPath = resolve(rootDirectory, 'packages/api-client/src/schema.d.ts')
const generatedHeader = '/**\n * Generated file. Do not edit.\n * Regenerate: corepack pnpm openapi:generate\n */\n\n'

export function exportDocuments(directory, environment = {}) {
    execFileSync(
        process.execPath,
        [
            '-r',
            require.resolve('ts-node/register/transpile-only'),
            resolve(rootDirectory, 'scripts/openapi/export-document.ts'),
            directory,
        ],
        {
            cwd: rootDirectory,
            env: environment,
            stdio: 'pipe',
            timeout: 120_000,
        },
    )
}

export async function generateSchema(snapshot, output) {
    const ast = await openapiTS(pathToFileURL(snapshot), {
        transform(schema) {
            if (schema.format !== 'binary') return
            const blob = ts.factory.createTypeReferenceNode('Blob')
            return schema.nullable
                ? ts.factory.createUnionTypeNode([blob, ts.factory.createLiteralTypeNode(ts.factory.createNull())])
                : blob
        },
    })
    await writeFile(output, generatedHeader + astToString(ast))
}

export async function checkArtifacts(directory, snapshot = snapshotPath, schema = schemaPath) {
    await generateSchema(resolve(directory, 'browser.json'), resolve(directory, 'schema.d.ts'))
    for (const [actual, expected] of [
        [resolve(directory, 'browser.json'), snapshot],
        [resolve(directory, 'schema.d.ts'), schema],
    ]) {
        let committed
        try {
            committed = await readFile(expected)
        } catch (error) {
            if (error.code !== 'ENOENT') throw error
            throw new Error(`Missing OpenAPI artifact: ${expected}. Run openapi:export and openapi:generate.`)
        }
        if (!(await readFile(actual)).equals(committed)) {
            throw new Error(`OpenAPI drift: ${expected}. Run openapi:export and openapi:generate.`)
        }
    }
}

export function assertTrackedArtifacts(repository = rootDirectory, artifacts = [snapshotPath, schemaPath]) {
    try {
        execFileSync('git', ['ls-files', '--error-unmatch', '--', ...artifacts], { cwd: repository, stdio: 'pipe' })
    } catch {
        throw new Error('OpenAPI artifacts must be tracked by Git. Stage both generated files before checking.')
    }
}

async function run(command) {
    if (command === 'generate') {
        await mkdir(dirname(schemaPath), { recursive: true })
        await generateSchema(snapshotPath, schemaPath)
        return
    }
    if (command !== 'export' && command !== 'check') throw new Error('Expected export, generate, or check')
    if (command === 'check') assertTrackedArtifacts()
    const directory = await mkdtemp(resolve(tmpdir(), 'lef-openapi-'))
    try {
        exportDocuments(directory)
        if (command === 'export') {
            await mkdir(dirname(snapshotPath), { recursive: true })
            await copyFile(resolve(directory, 'browser.json'), snapshotPath)
        } else {
            await checkArtifacts(directory)
        }
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    run(process.argv[2])
        .then(() => console.log(`OpenAPI ${process.argv[2]} passed`))
        .catch(error => {
            console.error(error.stderr?.toString() || error.message)
            process.exitCode = 1
        })
}
