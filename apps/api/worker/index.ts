import { env } from 'cloudflare:workers'
import app from './app'
import { validateAuthMailConfiguration } from './auth-mail'
import { validateAuthConfiguration } from './auth'

// Fail before serving requests. Auth handlers still validate current bindings after configuration changes.
validateAuthConfiguration(env)
validateAuthMailConfiguration(env)

export default app satisfies ExportedHandler<Env>
