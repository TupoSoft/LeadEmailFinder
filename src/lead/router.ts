import type { Request, Response, Router } from 'express'
import { authenticate, validateRequest } from '../middleware'
import type { LeadController } from './controller'
import {
    FIND_LEAD_BULK_RESULT_ROUTE,
    FIND_LEAD_BULK_ROUTE,
    FIND_LEAD_BULK_STATUS_ROUTE,
    FIND_LEAD_ROUTE,
} from './constants'
import { findLeadBulkRequestBodySchema, findLeadRequestBodySchema } from './validation'

export class LeadRouter {
    constructor(
        private readonly router: Router,
        private readonly leadController: LeadController,
    ) {}

    init(): void {
        this.router.post(
            FIND_LEAD_ROUTE,
            authenticate,
            validateRequest(findLeadRequestBodySchema, 'body'),
            this.leadController.find.bind(this.leadController),
        )

        this.router.post(
            FIND_LEAD_BULK_ROUTE,
            authenticate,
            validateRequest(findLeadBulkRequestBodySchema, 'body'),
            this.leadController.findBulk.bind(this.leadController),
        )

        this.router.get(
            FIND_LEAD_BULK_STATUS_ROUTE,
            authenticate,
            this.leadController.findBulkStatus.bind(this.leadController),
        )

        this.router.get(
            FIND_LEAD_BULK_RESULT_ROUTE,
            authenticate,
            this.leadController.getFindBulkResult.bind(this.leadController),
        )

        this.router.get('/ping', (_req, res: Response) => {
            res.send('PONG')
        })

        this.router.get('/', (_req: Request, res: Response) => {
            res.send('Hello World!')
        })
    }
}
