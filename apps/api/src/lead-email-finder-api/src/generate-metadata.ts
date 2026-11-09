import { PluginMetadataGenerator } from '@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator'
import { ReadonlyVisitor } from '@nestjs/swagger/dist/plugin'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Read the Nest build configuration so runtime and offline export cannot use different plugin options.
export function generateMetadata(outputDir = resolve('src')): void {
    const configuration = JSON.parse(readFileSync(resolve('nest-cli.json'), 'utf8')) as {
        compilerOptions: { plugins: { name: string; options: { introspectComments: boolean } }[] }
    }
    const plugin = configuration.compilerOptions.plugins.find(entry => entry.name === '@nestjs/swagger')
    if (!plugin) throw new Error('The Nest Swagger metadata plugin must be configured')
    new PluginMetadataGenerator().generate({
        visitors: [new ReadonlyVisitor({ ...plugin.options, pathToSource: outputDir })],
        outputDir,
        tsconfigPath: 'tsconfig.build.json',
        printDiagnostics: false,
    })
}

if (require.main === module) generateMetadata()
