import { sql } from 'drizzle-orm'
import { createDatabase } from './database/connection.js'

export default {
    async fetch(request, env) {
        const url = new URL(request.url)

        if (request.method === 'GET' && url.pathname === '/health') {
            const database = createDatabase(env.DB)
            await database.get(sql`SELECT 1`)

            return Response.json({ status: 'ok' })
        }

        return new Response('Not Found', { status: 404 })
    },
} satisfies ExportedHandler<Env>
