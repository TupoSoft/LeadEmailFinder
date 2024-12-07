import type { NextFunction, Request, Response } from 'express'
import { matchedData } from 'express-validator'
import type { EmailVerificationService } from './service'

export interface EmailVerificationController {
    verifyEmail: (req: Request, res: Response, next: NextFunction) => void
    verifyEmails: (req: Request, res: Response, next: NextFunction) => void
}

export class EmailVerificationControllerImpl implements EmailVerificationController {
    constructor(private readonly emailVerificationService: EmailVerificationService) {}

    verifyEmail(req: Request, res: Response, next: NextFunction): void {
        const { email } = matchedData<{ email: string }>(req)
        this.emailVerificationService.verifyEmail({ email }).then(
            verificationData => res.json(verificationData),
            (reason: unknown) => {
                next(reason)
            },
        )
    }

    verifyEmails(req: Request, res: Response, next: NextFunction): void {
        const { emails } = matchedData<{ emails: string[] }>(req)
        this.emailVerificationService.verifyEmails(emails.map(email => ({ email }))).then(
            value => res.json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }
}
