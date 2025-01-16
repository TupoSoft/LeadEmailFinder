import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../common'
import { constants as httpConstants } from 'http2'
import type { Logger } from '../logging'

export class ErrorMiddleware {
    constructor(private readonly logger: Logger) {}

    public handleError(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
        if (error instanceof HttpError) {
            const { status, message } = error
            res.status(status).json({ message })
            return
        }

        this.logger.error(`Unexpected error: ${String(error)}`)
        res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).json({ message: 'Unexpected error' })
    }
}
