import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { routePath } from 'hono/route'
import { createDatabase } from './database/connection.js'

const app = new Hono<{
    Bindings: Env
    Variables: { requestId: string }
}>()

app.use(async (context, next) => {
    const requestId = crypto.randomUUID()
    const startedAt = performance.now()

    context.set('requestId', requestId)
    context.header('X-Request-Id', requestId)

    await next()

    const method = /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|CONNECT|TRACE)$/.test(context.req.method)
        ? context.req.method
        : 'OTHER'
    const matchedRoute = routePath(context, -1)
    const route = matchedRoute === '*' || matchedRoute === '/*' || matchedRoute === '' ? 'unmatched' : matchedRoute

    console.info(
        JSON.stringify({
            event: 'request_completed',
            requestId,
            method,
            route,
            status: context.res.status,
            durationMs: Math.round(performance.now() - startedAt),
        }),
    )
})

app.get('/health', async context => {
    context.header('Cache-Control', 'no-store')

    try {
        const database = createDatabase(context.env.DB)
        await database.get(sql`SELECT 1`)

        return context.json({ status: 'ok', d1: 'up' }, 200)
    } catch {
        // Driver errors and their causes can contain SQL, credentials, and personal data.
        console.error(
            JSON.stringify({
                event: 'health_check_failed',
                requestId: context.get('requestId'),
                dependency: 'd1',
            }),
        )

        return context.json({ status: 'error', d1: 'down' }, 503)
    }
})

app.notFound(context => context.text('Not Found', 404))

app.onError((_error, context) => {
    console.error(JSON.stringify({ event: 'request_failed', requestId: context.get('requestId') }))

    return context.json({ status: 'error' }, 500)
})

export default app satisfies ExportedHandler<Env>
