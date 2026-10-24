import type { INestApplication } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

/** Register before body parsing and guards so every secret-operation response prevents caching. */
export function configureServiceClientResponseHeaders(app: Pick<INestApplication, 'use'>): void {
    app.use((request: Request, response: Response, next: NextFunction) => {
        if (
            (request.method === 'POST' &&
                /^\/v1\/organizations\/[^/]+\/service-clients(?:\/[^/]+\/rotate)?\/?$/i.test(request.path)) ||
            /^\/v1\/auth\/api-key\/?$/i.test(request.path)
        ) {
            response.setHeader('Cache-Control', 'no-store')
            response.setHeader('Referrer-Policy', 'no-referrer')
        }
        next()
    })
}
