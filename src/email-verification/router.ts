import type { Response, Router } from 'express'
import type { EmailVerificationController } from './controller'
import { body } from 'express-validator'
import { type AuthMiddleware, validate } from '../middleware'
import {
    VERIFY_EMAIL_BULK_RESULT_ROUTE,
    VERIFY_EMAIL_BULK_ROUTE,
    VERIFY_EMAIL_BULK_STATUS_ROUTE,
    VERIFY_EMAIL_ROUTE,
} from './constants'

const MIN_LENGTH = 1

export class EmailVerificationRouter {
    constructor(
        private readonly router: Router,
        private readonly emailVerificationController: EmailVerificationController,
        private readonly authMiddleware: AuthMiddleware,
    ) {}

    init(): void {
        this.router.post(
            VERIFY_EMAIL_ROUTE,
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
            VERIFY_EMAIL_BULK_ROUTE,
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

        this.router.get(
            VERIFY_EMAIL_BULK_STATUS_ROUTE,
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            this.emailVerificationController.getVerifyBulkStatus.bind(this.emailVerificationController),
        )

        this.router.get(
            VERIFY_EMAIL_BULK_RESULT_ROUTE,
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            this.emailVerificationController.getVerifyBulkResults.bind(this.emailVerificationController),
        )

        this.router.get('/ping', (_, res: Response) => {
            res.json('PONG')
        })
    }
}
