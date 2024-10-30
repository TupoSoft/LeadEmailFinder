import { type ContextRunner, type ValidationChain, validationResult } from 'express-validator'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { constants as httpConstants } from 'http2'
import type { Middleware } from 'express-validator/lib/base'

export default function (validationChain: Array<ValidationChain | (Middleware & ContextRunner)>): RequestHandler[] {
    return [
        ...validationChain,
        async function (req: Request, res: Response, next: NextFunction) {
            const result = validationResult(req)

            if (!result.isEmpty()) {
                return res.status(httpConstants.HTTP_STATUS_BAD_REQUEST).json({ errors: result.array() })
            }

            next()
        },
    ]
}
