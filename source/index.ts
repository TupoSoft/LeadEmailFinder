import express, { type Request, type Response } from 'express'
import { constants as httpConstants } from 'http2'
import { EmailVerifier, SMTPVerificationError } from './email-verifier'
import { LeadEmailFinder } from './lead-email-finder'
import { matchedData, oneOf, query, validationResult } from 'express-validator'
import { authenticate, log } from './middleware'

const { PORT } = process.env

const port = PORT ?? 3000
const emailVerifier = new EmailVerifier()
const leadEmailFinder = new LeadEmailFinder()

const app = express()

app.disable('x-powered-by')

app.get('/verify', authenticate, log, query('email').isEmail().notEmpty().escape(), (req: Request, res: Response) => {
    const result = validationResult(req)

    if (result.isEmpty()) {
        const data = matchedData(req)
        const email = data.email as string
        emailVerifier.verify(email).then(
            verificationData => {
                if (verificationData.error === SMTPVerificationError.InvalidEmailFormat) {
                    res.status(httpConstants.HTTP_STATUS_BAD_REQUEST)
                }

                res.json(verificationData)
            },
            _ => {
                res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
            },
        )

        return
    }

    res.status(httpConstants.HTTP_STATUS_BAD_REQUEST).json({ errors: result.array() })
})

app.get(
    '/findLead',
    authenticate,
    oneOf([query('firstName').isString().notEmpty().escape(), query('lastName').isString().notEmpty().escape()]),
    query('domain').isString().notEmpty().escape(),
    (req: Request, res: Response) => {
        const result = validationResult(req)

        if (result.isEmpty()) {
            const { firstName, lastName, domain } = matchedData(req)

            leadEmailFinder
                .findLead({
                    firstName,
                    lastName,
                    domain,
                })
                .then(
                    value => res.json(value),
                    _ => res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR),
                )

            return
        }

        res.status(httpConstants.HTTP_STATUS_BAD_REQUEST).json({ errors: result.array() })
    },
)

app.get('/ping', (_, res: Response) => {
    res.status(httpConstants.HTTP_STATUS_OK).json({ reply: 'PONG' })
})

app.get('/', (_: Request, res: Response) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})
