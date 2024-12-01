import type { NextFunction, Request, Response } from 'express'
import type { DomainService } from './service'
import { matchedData } from 'express-validator'
import type { Domain } from './dto'

export interface DomainController {
    create: (req: Request, res: Response, next: NextFunction) => void
}

export class DomainControllerImpl implements DomainController {
    constructor(private readonly domainService: DomainService) {}

    create = (req: Request, res: Response, next: NextFunction): void => {
        const domain: Domain = matchedData(req)
        this.domainService.create(domain).then(
            _ => res.status(201).send(),
            reason => {
                next(reason)
            },
        )
    }
}
