import type { NextFunction, Request, Response } from 'express'
import type { DomainService } from './service'
import { matchedData } from 'express-validator'
import type { Domain } from './entity'
import { constants } from 'node:http2'

export interface DomainController {
    create: (req: Request, res: Response, next: NextFunction) => void
}

export class DomainControllerImpl implements DomainController {
    constructor(private readonly domainService: DomainService) {}

    create = (req: Request, res: Response, next: NextFunction): void => {
        const domain: Domain = matchedData(req)
        this.domainService.create(domain).then(
            _ => res.status(constants.HTTP_STATUS_CREATED).send(),
            (reason: unknown) => {
                next(reason)
            },
        )
    }
}
