import type { NextFunction, Request, Response } from 'express'
import { constants } from 'node:http2'
import type { FindLeadRequest } from './dto'
import type { LeadQueue } from './queue'
import { FIND_LEAD_BULK_STATUS_ROUTE } from './constants'
import type { LeadFinder } from './finder'

export class LeadController {
    constructor(
        private readonly leadFinder: LeadFinder,
        private readonly findLeadQueue: LeadQueue,
    ) {}

    find(req: Request<unknown, unknown, FindLeadRequest>, res: Response, next: NextFunction): void {
        const { body: lead } = req

        this.leadFinder.findLead(lead).then(
            value => res.json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }

    findBulk(req: Request<unknown, unknown, FindLeadRequest[]>, res: Response, next: NextFunction): void {
        const { body: leads } = req
        const { HTTP_STATUS_ACCEPTED } = constants
        const host = req.hostname === 'localhost' ? req.headers.host : req.hostname

        this.findLeadQueue.addJob('findBulk', leads).then(
            id => {
                res.status(HTTP_STATUS_ACCEPTED).json({
                    taskId: id,
                    message: 'Request accepted. Starting to find leads.',
                    monitorUrl: `${req.protocol}://${host}${FIND_LEAD_BULK_STATUS_ROUTE.replace(':id', id)}`,
                })
            },
            (reason: unknown) => {
                next(reason)
            },
        )
    }

    findBulkStatus(req: Request, res: Response, next: NextFunction): void {
        const { params } = req
        const { id } = params
        const { HTTP_STATUS_OK } = constants

        this.findLeadQueue.getStatus(id).then(
            value => res.status(HTTP_STATUS_OK).json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }

    getFindBulkResult(req: Request, res: Response, next: NextFunction): void {
        const { params } = req
        const { id } = params
        const { HTTP_STATUS_OK } = constants

        this.findLeadQueue.getResult(id).then(
            value => res.status(HTTP_STATUS_OK).json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }
}
