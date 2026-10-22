import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const OUTPUT = '.dev/auth-tools'
const SOURCE_ROOTS = ['src', 'scripts/better-auth']
const EXCLUDED = [/\.spec\.ts$/, /\.d\.ts$/, /^src\/libs\/common\/src\/testing\//, /^src\/metadata\.ts$/]

function sources(checkoutRoot, directory) {
    return readdirSync(resolve(checkoutRoot, directory), { withFileTypes: true }).flatMap(entry => {
        const path = `${directory}/${entry.name}`
        if (entry.isDirectory()) return sources(checkoutRoot, path)
        return entry.isFile() && path.endsWith('.ts') && !EXCLUDED.some(pattern => pattern.test(path)) ? [path] : []
    })
}

/**
 * Compiles authentication tooling to CommonJS with the application's decorator settings and path aliases. Node
 * executes the emitted files directly; ts-node is not used because it cannot prove the compiled ESM loading.
 */
export function compileAuthTools(checkoutRoot) {
    const swc = require(resolve(checkoutRoot, 'node_modules/@swc/core'))
    const { compilerOptions } = JSON.parse(readFileSync(resolve(checkoutRoot, 'tsconfig.json'), 'utf8'))
    const output = resolve(checkoutRoot, OUTPUT)
    rmSync(output, { recursive: true, force: true })
    for (const file of SOURCE_ROOTS.flatMap(root => sources(checkoutRoot, root))) {
        const target = join(output, file.replace(/\.ts$/, '.js'))
        const { code } = swc.transformFileSync(resolve(checkoutRoot, file), {
            swcrc: false,
            filename: resolve(checkoutRoot, file),
            sourceMaps: false,
            module: { type: 'commonjs' },
            jsc: {
                target: 'es2023',
                parser: { syntax: 'typescript', decorators: true, dynamicImport: true },
                transform: { legacyDecorator: true, decoratorMetadata: true, useDefineForClassFields: false },
                keepClassNames: true,
                baseUrl: checkoutRoot,
                paths: compilerOptions.paths,
            },
        })
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
        writeFileSync(target, code)
    }
    return {
        output,
        entry: name => join(output, 'scripts/better-auth', `${name}.js`),
        relative: relative(checkoutRoot, output),
    }
}
