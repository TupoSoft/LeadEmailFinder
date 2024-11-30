import type { Request, Response, Router } from 'express'
import type { EmailVerificationController } from './controller'
import { body } from 'express-validator'
import { authenticate, log, validate } from '../middleware'

export class EmailVerificationRouter {
    constructor(
        private readonly router: Router,
        private readonly emailVerificationController: EmailVerificationController,
    ) {}

    init(): void {
        this.router.post(
            '/verifyEmail',
            authenticate,
            validate([
                body('email')
                    .isString()
                    .withMessage('The email should be a string')
                    .notEmpty()
                    .withMessage('Email should not be empty')
                    .isEmail()
                    .withMessage('Invalid email address')
                    .escape(),
            ]),
            this.emailVerificationController.verifyEmail.bind(this.emailVerificationController),
        )

        this.router.post(
            '/verifyEmails',
            authenticate,
            validate([
                body('emails').isArray({ min: 1 }).withMessage('Must be a non-empty array of emails'),
                body('emails.*')
                    .isString()
                    .withMessage('Email should be a string')
                    .bail()
                    .notEmpty()
                    .withMessage('Email cannot be empty')
                    .bail()
                    .isEmail()
                    .withMessage('Invalid email address'),
            ]),
            this.emailVerificationController.verifyEmails.bind(this.emailVerificationController),
        )

        this.router.get('/ping', log, (_, res: Response) => {
            res.send('PONG')
        })

        this.router.get('/', log, (_: Request, res: Response) => {
            res.send('Hello World!')
        })
    }
}
