import { type ContextRunner, type ValidationChain, validationResult } from 'express-validator'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { Middleware } from 'express-validator/lib/base'
import { ZodError, type ZodSchema } from 'zod'
import { HttpError } from '../common'

export function validate(validationChain: Array<ValidationChain | (Middleware & ContextRunner)>): RequestHandler[] {
    return [
        ...validationChain,
        function (req: Request, _res: Response, next: NextFunction) {
            const result = validationResult(req)

            if (!result.isEmpty()) {
                const [firstError] = result.array({ onlyFirstError: true })

                if (typeof firstError.msg === 'string') {
                    next(HttpError.BadRequest(firstError.msg))
                    return
                }

                next(firstError)
                return
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

                next(HttpError.BadRequest(message))
            } else {
                next(err)
            }
        }
    }
