import type { Request, Response, Router } from 'express'
import type { EmailVerificationController } from './email-verification-controller'
import { authenticate, log, validate } from './middleware'
import { body, query } from 'express-validator'

export class EmailVerificationRouter {
    constructor(
        private readonly router: Router,
        private readonly emailVerificationController: EmailVerificationController,
    ) {}

    init(): void {
        this.router.get(
            '/verify',
            authenticate,
            log,
            validate([query('email').isEmail().notEmpty().escape()]),
            this.emailVerificationController.verifyEmail.bind(this.emailVerificationController),
        )

        this.router.post(
            '/verify',
            authenticate,
            log,
            validate([body('emails').isArray({ min: 1 })]),
            this.emailVerificationController.verifyEmails.bind(this.emailVerificationController),
        )

        this.router.post(
            '/findLead',
            authenticate,
            log,
            validate([body(['firstName', 'lastName', 'domain']).isString().notEmpty()]),
            this.emailVerificationController.findLead.bind(this.emailVerificationController),
        )

        this.router.get('/ping', log, (_, res: Response) => {
            res.send('PONG')
        })

        this.router.get('/', log, (_: Request, res: Response) => {
            res.send('Hello World!')
        })
    }
}
