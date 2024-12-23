import type { Request, Response, Router } from 'express'
import { authenticate, log, validate } from '../middleware'
import { body, oneOf } from 'express-validator'
import type { FindLeadController } from './controller'

export class FindLeadRouter {
    constructor(
        private readonly router: Router,
        private readonly findLeadController: FindLeadController,
    ) {}

    init(): void {
        this.router.post(
            '/findLead',
            authenticate,
            validate([
                body(['domain']).isString().notEmpty(),
                oneOf([body('firstName').isString().notEmpty(), body('lastName').isString().notEmpty()]),
            ]),
            this.findLeadController.findLead.bind(this.findLeadController),
        )

        this.router.post(
            '/findLeads',
            authenticate,
            validate([
                body('leads').isArray({ min: 1 }),
                body(['leads.*.firstName', 'leads.*.lastName', 'leads.*.domain']).isString().notEmpty(),
            ]),
            this.findLeadController.findLeads.bind(this.findLeadController),
        )

        // For testing purposes
        this.router.get(
            '/findSynonyms',
            authenticate,
            validate([
                body('domain').isString().notEmpty(),
            ]),
            this.findLeadController.findSynonyms.bind(this.findLeadController),
        )

        this.router.get('/ping', log, (_, res: Response) => {
            res.send('PONG')
        })

        this.router.get('/', log, (_: Request, res: Response) => {
            res.send('Hello World!')
        })
    }
}
