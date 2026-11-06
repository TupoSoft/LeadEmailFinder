import type { INestApplication } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

/** Register before parsers and logging, including for rejected and malformed auth requests. */
export function configureAuthResponseHeaders(app: Pick<INestApplication, 'use'>): void {
    app.use((request: Request, response: Response, next: NextFunction) => {
        if (/^\/v1\/auth(?:\/|$)/i.test(request.path)) {
            response.setHeader('Cache-Control', 'no-store')
            response.setHeader('Referrer-Policy', 'no-referrer')
        }
        next()
    })
}
