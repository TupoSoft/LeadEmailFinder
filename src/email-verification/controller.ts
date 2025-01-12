import type { NextFunction, Request, Response } from 'express'
import { matchedData } from 'express-validator'
import type { EmailVerificationService } from './service'

export interface EmailVerificationController {
    verifyEmail: (req: Request, res: Response, next: NextFunction) => void
    verifyEmails: (req: Request, res: Response, next: NextFunction) => void
    getVerifyBulkStatus: (req: Request, res: Response, next: NextFunction) => void
    getVerifyBulkResults: (req: Request, res: Response, next: NextFunction) => void
}

export class ExpressEmailVerificationController implements EmailVerificationController {
    constructor(private readonly emailVerificationService: EmailVerificationService) {}

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
        this.emailVerificationService.verifyBulk(emails).then(
            value => res.json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }

    getVerifyBulkStatus(req: Request, res: Response, next: NextFunction): void {
        const { params } = req
        const { id } = params

        this.emailVerificationService.findBulkStatus(id).then(
            value => res.json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }

    getVerifyBulkResults(req: Request, res: Response, next: NextFunction): void {
        const { params } = req
        const { id } = params

        this.emailVerificationService.getFindBulkResult(id).then(
            value => res.json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }
}
