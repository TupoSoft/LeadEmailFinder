import type { NextFunction, Request, Response } from 'express'
import type { LeadService } from './service'
import { constants } from 'node:http2'
import type { FindLeadRequest } from './dto'

export class LeadController {
    constructor(private readonly findLeadService: LeadService) {}

    find(req: Request<unknown, unknown, FindLeadRequest>, res: Response, next: NextFunction): void {
        const { body: lead } = req

        this.findLeadService.find(lead).then(
            value => res.json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }

    findBulk(req: Request<unknown, unknown, FindLeadRequest[]>, res: Response, next: NextFunction): void {
        const { body: leads } = req
        const { HTTP_STATUS_ACCEPTED } = constants

        this.findLeadService.findBulk(leads).then(
            value => {
                value.monitorUrl = `${req.protocol}://${req.hostname}${value.monitorUrl}`
                res.status(HTTP_STATUS_ACCEPTED).json(value)
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

        this.findLeadService.findBulkStatus(id).then(
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

        this.findLeadService.getFindBulkResult(id).then(
            value => res.status(HTTP_STATUS_OK).json(value),
            (reason: unknown) => {
                next(reason)
            },
        )
    }
}
