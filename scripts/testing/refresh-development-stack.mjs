import { resolve } from 'node:path'
import { loadDevelopmentStack } from './development-stack.mjs'

// Reinspect ownership and ports before persisting local credentials. Never print the returned metadata.
loadDevelopmentStack(resolve(import.meta.dirname, '../..'))
