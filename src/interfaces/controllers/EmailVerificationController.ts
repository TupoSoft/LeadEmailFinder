import type { Request, Response } from 'express'
import type { VerifyEmail } from '../../application/use-cases'
import { matchedData, validationResult } from 'express-validator'
import { constants as httpConstants } from 'http2'

export class EmailVerificationController {
    constructor(private readonly verifyEmail: VerifyEmail) {}

    async verify(req: Request, res: Response): Promise<void> {
        const result = validationResult(req)

        if (result.isEmpty()) {
            const data = matchedData(req)
            const email = data.email as string
            this.verifyEmail.execute(email).then(
                verificationData => res.json(verificationData),
                reason => {
                    console.log(`The error has occurred: ${reason}`)
                    res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).send('Something went wrong...')
                },
            )

            return
        }

        res.status(httpConstants.HTTP_STATUS_BAD_REQUEST).json({ errors: result.array() })
    }
}
