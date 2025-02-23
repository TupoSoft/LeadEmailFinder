import type { Router } from 'express'
import type { EmailController } from './controller'
import { type AuthMiddleware, validateRequest } from '../middleware'
import {
    createEmailRequestValidationSchema,
    requestWithIdParamValidationSchema,
    updateEmailRequestValidationSchema,
} from './validation'
import { EMAIL_ROUTE, EMAIL_ROUTE_WITH_PARAM } from './constants'

export class EmailRouter {
    constructor(
        private readonly router: Router,
        private readonly controller: EmailController,
        private readonly authMiddleware: AuthMiddleware,
    ) {}

    init(): void {
        const requestWithIdValidator = validateRequest(requestWithIdParamValidationSchema, 'params')

        this.router.get(
            EMAIL_ROUTE,
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            this.controller.getEmails,
        )

        this.router.post(
            EMAIL_ROUTE,
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            validateRequest(createEmailRequestValidationSchema, 'body'),
            this.controller.createEmail,
        )

        this.router.get(
            EMAIL_ROUTE_WITH_PARAM,
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            requestWithIdValidator,
            this.controller.getEmailById,
        )

        this.router.patch(
            EMAIL_ROUTE_WITH_PARAM,
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            requestWithIdValidator,
            validateRequest(updateEmailRequestValidationSchema, 'body'),
            this.controller.updateEmail,
        )

        // this.router.delete(
        //     EMAIL_ROUTE_WITH_PARAM,
        //     this.authMiddleware.authenticate.bind(this.authMiddleware),
        //     requestWithIdValidator,
        //     this.controller.deleteEmail,
        // )
    }
}
