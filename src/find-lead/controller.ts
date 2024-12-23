import type { NextFunction, Request, Response } from 'express'
import { matchedData } from 'express-validator'
import type { Lead } from './dto'
import type { FindLeadService } from './service'

export interface FindLeadController {
    findLead: (req: Request, res: Response, next: NextFunction) => void
    findLeads: (req: Request, res: Response, next: NextFunction) => void

    // For testing purposes
    findSynonyms: (req: Request, res: Response, next: NextFunction) => void
}

export class FindLeadControllerImpl implements FindLeadController {
    constructor(private readonly findLeadService: FindLeadService) {}

    findLead(req: Request, res: Response, next: NextFunction): void {
        const lead: Lead = matchedData(req)
        this.findLeadService.findLead(lead).then(
            value => res.json(value),
            reason => {
                next(reason)
            },
        )
    }

    findLeads(req: Request, res: Response, next: NextFunction): void {
        const { leads } = matchedData(req)
        this.findLeadService.findLeads(leads as Lead[]).then(
            value => res.json(value),
            reason => {
                next(reason)
            },
        )
    }

    findSynonyms(req: Request, res: Response, next: NextFunction): void {
        const { domain } = matchedData(req)
        this.findLeadService.findSynonyms(domain).then(
            value => res.json(value),
            reason => {
                next(reason)
            }
        )
    }
}
