import type { EmailVerificationService } from './service'
import { matchedData, validationResult } from 'express-validator'
import type { Request, Response } from 'express'
import { constants } from 'node:http2'

export class LegacyEmailVerificationController {
    constructor(private readonly emailVerificationService: EmailVerificationService) {}

    verify(req: Request, res: Response): void {
        const result = validationResult(req)

        if (result.isEmpty()) {
            const { email } = matchedData<{ email: string }>(req)
            this.emailVerificationService.verify({ email }).then(
                verificationData => res.json(verificationData),
                (reason: unknown) => {
                    console.log('The error has occurred:', reason)
                    res.status(constants.HTTP_STATUS_INTERNAL_SERVER_ERROR).send('Something went wrong...')
                },
            )

            return
        }

        res.status(constants.HTTP_STATUS_BAD_REQUEST).json({ errors: result.array() })
    }
}
