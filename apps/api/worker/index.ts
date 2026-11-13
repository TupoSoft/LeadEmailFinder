import { env } from 'cloudflare:workers'
import app from './app.js'
import { validateAuthMailConfiguration } from './auth-mail.js'
import { validateAuthConfiguration } from './auth.js'

// Fail before serving requests. Auth handlers still validate current bindings after configuration changes.
validateAuthConfiguration(env)
validateAuthMailConfiguration(env)

export default app satisfies ExportedHandler<Env>
