import type { NextFunction, Request, Response } from 'express'
import { matchedData } from 'express-validator'
import type { IEmailVerificationService } from './service'
import { constants } from 'node:http2'
import { JobNotFoundError } from './errors'
import { HttpError } from '../common'
import type { IEmailVerificationQueue } from './queue'
import { VERIFY_EMAIL_BULK_STATUS_ROUTE } from './constants'

export interface EmailVerificationController {
    verifyEmail: (req: Request, res: Response, next: NextFunction) => void
    verifyEmails: (req: Request, res: Response, next: NextFunction) => void
    getVerifyBulkStatus: (req: Request, res: Response, next: NextFunction) => void
    getVerifyBulkResults: (req: Request, res: Response, next: NextFunction) => void
}

export class ExpressEmailVerificationController implements EmailVerificationController {
    constructor(
        private readonly emailVerificationService: IEmailVerificationService,
        private readonly emailVerificationQueue: IEmailVerificationQueue,
    ) {}

    private static handleError(error: unknown, _req: Request<unknown>, _res: Response, next: NextFunction): void {
        if (error instanceof JobNotFoundError) {
            const { message } = error
            next(HttpError.NotFound(message))
        } else {
            next(error)
        }
    }

    verifyEmail(req: Request, res: Response, next: NextFunction): void {
        const { email } = matchedData<{ email: string }>(req)
        this.emailVerificationService.verify({ email }).then(
            verificationData => res.json(verificationData),
            (reason: unknown) => {
                ExpressEmailVerificationController.handleError(reason, req, res, next)
            },
        )
    }

    verifyEmails(req: Request<unknown, unknown, string[]>, res: Response, next: NextFunction): void {
        const { body: emails } = req

        const host = req.hostname === 'localhost' ? req.headers.host : req.hostname

        this.emailVerificationQueue.addJob('verifyBulk', emails).then(
            taskId => {
                const monitorUrl = `${req.protocol}://${host}${VERIFY_EMAIL_BULK_STATUS_ROUTE.replace(':id', taskId)}`
                res.status(constants.HTTP_STATUS_ACCEPTED).json({
                    taskId,
                    message: 'Request accepted. Starting to find emails.',
                    monitorUrl,
                })
            },
            (reason: unknown) => {
                ExpressEmailVerificationController.handleError(reason, req, res, next)
            },
        )
    }

    getVerifyBulkStatus(req: Request, res: Response, next: NextFunction): void {
        const { params } = req
        const { id } = params

        this.emailVerificationQueue.getStatus(id).then(
            value => res.json(value),
            (reason: unknown) => {
                ExpressEmailVerificationController.handleError(reason, req, res, next)
            },
        )
    }

    getVerifyBulkResults(req: Request, res: Response, next: NextFunction): void {
        const { params } = req
        const { id } = params

        this.emailVerificationQueue.getResult(id).then(
            value => res.json(value),
            (reason: unknown) => {
                ExpressEmailVerificationController.handleError(reason, req, res, next)
            },
        )
    }
}
