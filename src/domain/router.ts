import type { Router } from 'express'
import type { DomainController } from './controller'
import { type AuthMiddleware, validate } from '../middleware'
import { body } from 'express-validator'
import { ZERO } from '../common'

export class DomainRouter {
    constructor(
        private readonly router: Router,
        private readonly domainController: DomainController,
        private readonly authMiddleware: AuthMiddleware,
    ) {}

    init(): void {
        this.router.post(
            '/domain',
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            validate([
                body('name').isString().notEmpty(),
                body('emailFormats').isArray().optional().default([]),
                body('emailFormats.*.name').isString().notEmpty(),
                body('emailFormats.*.count').isInt({ min: ZERO }),
                body('catchAllEnabled').isBoolean().optional(),
                body('mxRecords').isArray().optional(),
                body('mxRecords.*.priority').isInt({ min: ZERO }),
                body('mxRecords.*.exchange').isString().notEmpty(),
            ]),
            this.domainController.create.bind(this.domainController),
        )
    }
}
