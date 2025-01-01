import type { NextFunction, Request, Response } from 'express'
import { matchedData } from 'express-validator'
import type { EmailVerifier } from './verifier'

export interface EmailVerificationController {
    verifyEmail: (req: Request, res: Response, next: NextFunction) => void
    verifyEmails: (req: Request, res: Response, next: NextFunction) => void
}

export class ExpressEmailVerificationController implements EmailVerificationController {
    constructor(private readonly emailVerificationService: EmailVerifier) {}

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
        Promise.all(emails.map(async email => await this.emailVerificationService.verify({ email }))).then(
            value => res.json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }
}
