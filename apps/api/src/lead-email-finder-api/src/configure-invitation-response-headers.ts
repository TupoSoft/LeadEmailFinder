import type { INestApplication } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

/** Register before Nest's body parsers so even malformed invitation requests cannot be cached. */
export function configureInvitationResponseHeaders(app: Pick<INestApplication, 'use'>): void {
    app.use((request: Request, response: Response, next: NextFunction) => {
        if (/^\/v1\/organizations(?:\/invitations(?:\/|$)|\/[^/]+\/invitations(?:\/|$)|\/?$)/.test(request.path)) {
            response.setHeader('Cache-Control', 'no-store')
            response.setHeader('Referrer-Policy', 'no-referrer')
        }
        next()
    })
}
