import { cpSync, existsSync, readdirSync } from 'fs'
import { resolve } from 'path'

const protoDir = resolve(__dirname, '../proto')

if (!existsSync(protoDir)) {
    console.info('Proto directory not found')
    process.exit(0)
}

const appDirs = readdirSync(resolve(__dirname, '../apps'))

for (const app of appDirs) {
    const appSrcDir = resolve(__dirname, `../apps/${app}/src`)

    if (!existsSync(appSrcDir)) {
        continue
    }

    cpSync(protoDir, appSrcDir)
}
