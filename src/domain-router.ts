import type { Router } from 'express'
import type { DomainController } from './domain-controller'
import { authenticate, log, validate } from './middleware'
import { body } from 'express-validator'

export class DomainRouter {
    constructor(
        private readonly router: Router,
        private readonly domainController: DomainController,
    ) {}

    init(): void {
        this.router.post(
            '/domain',
            authenticate,
            log,
            validate([
                body('name').isString().notEmpty(),
                body('emailFormats').isArray().optional().default([]),
                body('emailFormats.*.name').isString().notEmpty(),
                body('emailFormats.*.count').isInt({ min: 0 }),
                body('catchAllEnabled').isBoolean().optional(),
                body('mxRecords').isArray().optional(),
                body('mxRecords.*.priority').isInt({ min: 0 }),
                body('mxRecords.*.exchange').isString().notEmpty(),
            ]),
            this.domainController.create.bind(this.domainController),
        )
    }
}
