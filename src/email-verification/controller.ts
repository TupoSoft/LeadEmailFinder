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
        const data = matchedData(req)
        const email = data.email as string
        this.emailVerificationService.verifyEmail({ email }).then(
            verificationData => res.json(verificationData),
            reason => {
                next(reason)
            },
        )
    }

    verifyEmails(req: Request, res: Response, next: NextFunction): void {
        const data = matchedData(req)
        const emails = data.emails as string[]
        this.emailVerificationService.verifyEmails(emails.map(email => ({ email }))).then(
            value => res.json(value),
            reason => {
                next(reason)
            },
        )
    }
}
