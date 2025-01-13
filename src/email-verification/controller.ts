import type { NextFunction, Request, Response } from 'express'
import { matchedData } from 'express-validator'
import type { IEmailVerificationService } from './service'
import { constants } from 'node:http2'

export interface EmailVerificationController {
    verifyEmail: (req: Request, res: Response, next: NextFunction) => void
    verifyEmails: (req: Request, res: Response, next: NextFunction) => void
    getVerifyBulkStatus: (req: Request, res: Response, next: NextFunction) => void
    getVerifyBulkResults: (req: Request, res: Response, next: NextFunction) => void
}

export class ExpressEmailVerificationController implements EmailVerificationController {
    constructor(private readonly emailVerificationService: IEmailVerificationService) {}

    verifyEmail(req: Request, res: Response, next: NextFunction): void {
        const { email } = matchedData<{ email: string }>(req)
        this.emailVerificationService.verify({ email }).then(
            verificationData => res.json(verificationData),
            (reason: unknown) => {
                next(reason)
            },
        )
    }

    verifyEmails(req: Request, res: Response, next: NextFunction): void {
        const { emails } = matchedData<{ emails: string[] }>(req)
        const { HTTP_STATUS_ACCEPTED } = constants

        this.emailVerificationService.verifyBulk(emails).then(
            value => {
                value.monitorUrl = `${req.protocol}://${req.headers.host}${value.monitorUrl}`
                res.status(HTTP_STATUS_ACCEPTED).json(value)
            },
            (reason: unknown) => {
                next(reason)
            },
        )
    }

    getVerifyBulkStatus(req: Request, res: Response, next: NextFunction): void {
        const { params } = req
        const { id } = params

        this.emailVerificationService.getVerifyBulkStatus(id).then(
            value => res.json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }

    getVerifyBulkResults(req: Request, res: Response, next: NextFunction): void {
        const { params } = req
        const { id } = params

        this.emailVerificationService.getVerifyBulkResult(id).then(
            value => res.json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }
}
