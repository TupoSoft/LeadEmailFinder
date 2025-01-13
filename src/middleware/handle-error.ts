import type { Request, Response } from 'express'
import { HttpError } from '../common'
import { constants as httpConstants } from 'http2'

export default function handleError(error: unknown, _req: Request, res: Response): void {
    if (error instanceof HttpError) {
        const { status, message } = error
        res.status(status).json({ message })
        return
    }

    res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).json({ message: 'Unexpected error' })
}
