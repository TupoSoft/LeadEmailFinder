import express, { type Request, type Response } from 'express'
import { constants as httpConstants } from 'http2'
import { EmailVerifier } from './email/email-verifier'
import rotator from './proxy'
import { LeadEmailFinder } from './email/lead-email-finder'
import { matchedData, oneOf, query, validationResult } from 'express-validator'
import { authenticate, log } from './middleware'
import { EmailFormatManager } from './email/email-format'
import Redis from 'ioredis'

const { PORT } = process.env

const port = PORT ?? 3000

const redis = new Redis({
    host: 'redis',
})
const emailFormatManager = new EmailFormatManager(redis)
const emailVerifier = new EmailVerifier(rotator)
const leadEmailFinder = new LeadEmailFinder(rotator, emailFormatManager)

const app = express()

app.disable('x-powered-by')

const validateVerify = query('email').isEmail().notEmpty().escape()

app.get('/verify', authenticate, log, validateVerify, (req: Request, res: Response) => {
    const result = validationResult(req)

    if (result.isEmpty()) {
        const data = matchedData(req)
        const email = data.email as string
        emailVerifier.verify(email).then(
            verificationData => res.json(verificationData),
            reason => {
                console.log(`The error has occurred: ${reason}`)
                res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).send('Something went wrong...')
            },
        )

        return
    }

    res.status(httpConstants.HTTP_STATUS_BAD_REQUEST).json({ errors: result.array() })
})

const validateFindLead = [
    oneOf([query('firstName').isString().notEmpty().escape(), query('lastName').isString().notEmpty().escape()]),
    query('domain').isString().notEmpty().escape(),
]

app.get('/findLead', authenticate, log, validateFindLead, (req: Request, res: Response) => {
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
                reason => {
                    console.log(`The error has occurred: ${reason}`)
                    res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).send('Something went wrong...')
                },
            )

        return
    }

    res.status(httpConstants.HTTP_STATUS_BAD_REQUEST).json({ errors: result.array() })
})

app.get('/ping', log, (_, res: Response) => {
    res.send('PONG')
})

app.get('/', log, (_: Request, res: Response) => {
    res.send('Welcome to the Lead Email Finder main page!')
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})
