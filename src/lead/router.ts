import type { Request, Response, Router } from 'express'
import { authenticate, log, validate } from '../middleware'
import { body, oneOf } from 'express-validator'
import type { LeadController } from './controller'

export class LeadRouter {
    constructor(
        private readonly router: Router,
        private readonly leadController: LeadController,
    ) {}

    init(): void {
        this.router.post(
            '/lead/find',
            authenticate,
            validate([
                body(['domain']).isString().notEmpty(),
                oneOf([body('firstName').isString().notEmpty(), body('lastName').isString().notEmpty()]),
            ]),
            this.leadController.find.bind(this.leadController),
        )

        this.router.post(
            '/lead/find/bulk',
            authenticate,
            validate([
                body('leads').isArray({ min: 1 }),
                body(['leads.*.firstName', 'leads.*.lastName', 'leads.*.domain']).isString().notEmpty(),
            ]),
            this.leadController.findBulk.bind(this.leadController),
        )

        this.router.get(
            '/lead/find/bulk/:id/status',
            authenticate,
            this.leadController.findBulkStatus.bind(this.leadController),
        )

        this.router.get(
            '/lead/find/bulk/:id',
            authenticate,
            this.leadController.getFindBulkResult.bind(this.leadController),
        )

        this.router.get('/ping', log, (_req, res: Response) => {
            res.send('PONG')
        })

        this.router.get('/', log, (_req: Request, res: Response) => {
            res.send('Hello World!')
        })
    }
}
