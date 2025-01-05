import { type ContextRunner, type ValidationChain, validationResult } from 'express-validator'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { constants as httpConstants } from 'http2'
import type { Middleware } from 'express-validator/lib/base'
import { ZodError, type ZodSchema } from 'zod'

export function validate(validationChain: Array<ValidationChain | (Middleware & ContextRunner)>): RequestHandler[] {
    return [
        ...validationChain,
        function (req: Request, res: Response, next: NextFunction) {
            const result = validationResult(req)

            if (!result.isEmpty()) {
                return res.status(httpConstants.HTTP_STATUS_BAD_REQUEST).json({ errors: result.array() })
            }

            next()
        },
    ]
}

export const validateRequest =
    (schema: ZodSchema, type: 'body' | 'query' | 'params' = 'body') =>
    (req: Request, res: Response, next: NextFunction): void => {
        try {
            schema.parse(req[type])
            next()
        } catch (err) {
            if (err instanceof ZodError) {
                const {
                    errors: [{ message }],
                } = err

                res.status(httpConstants.HTTP_STATUS_BAD_REQUEST).json({
                    message,
                })
            } else {
                next(err)
            }
        }
    }
