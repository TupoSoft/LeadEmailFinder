import type { Request, Response } from 'express'
import { matchedData } from 'express-validator'
import { constants as httpConstants } from 'node:http2'
import type { EmailVerificationService } from './email-verification-service'

export interface EmailVerificationController {
    verifyEmail: (req: Request, res: Response) => void
    verifyEmails: (req: Request, res: Response) => void
}

export class EmailVerificationControllerImpl implements EmailVerificationController {
    constructor(private readonly emailVerificationService: EmailVerificationService) {}

    verifyEmail(req: Request, res: Response): void {
        const data = matchedData(req)
        const email = data.email as string
        this.emailVerificationService.verifyEmail(email).then(
            verificationData => res.json(verificationData),
            reason => {
                console.log(`The error has occurred: ${reason}`)
                res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).send('Something went wrong...')
            },
        )
    }

    verifyEmails(req: Request, res: Response): void {
        const data = matchedData(req)
        const emails = data.emails as string[]
        this.emailVerificationService.verifyEmails(emails).then(
            value => res.json(value),
            reason => {
                console.log(`The error has occurred: ${reason}`)
                res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).send('Something went wrong...')
            },
        )
    }
}
