import type { Response, Router } from 'express'
import type { EmailVerificationController } from './controller'
import { body } from 'express-validator'
import { type AuthMiddleware, validate } from '../middleware'

const MIN_LENGTH = 1

export class EmailVerificationRouter {
    constructor(
        private readonly router: Router,
        private readonly emailVerificationController: EmailVerificationController,
        private readonly authMiddleware: AuthMiddleware,
    ) {}

    init(): void {
        this.router.post(
            '/emails/verify',
            this.authMiddleware.authenticate.bind(this.authMiddleware),
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
            '/emails/verify/bulk',
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            validate([
                body('emails').isArray({ min: MIN_LENGTH }).withMessage('Must be a non-empty array of emails'),
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

        this.router.get('/ping', (_, res: Response) => {
            res.json('PONG')
        })
    }
}
