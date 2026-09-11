import type { INestApplication } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

/** Run before parsing, authentication, and validation, including malformed credential-bearing requests. */
export function configureProxyResponseHeaders(app: Pick<INestApplication, 'use'>): void {
    app.use((request: Request, response: Response, next: NextFunction) => {
        if (
            (request.method === 'POST' && /^\/v1\/proxies\/?$/i.test(request.path)) ||
            (request.method === 'PATCH' && /^\/v1\/proxies\/[^/]+\/?$/i.test(request.path))
        ) {
            response.setHeader('Cache-Control', 'no-store')
        }
        next()
    })
}
