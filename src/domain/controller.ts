import type { NextFunction, Request, Response } from 'express'
import { matchedData } from 'express-validator'
import type { Domain } from './entity'
import { constants } from 'node:http2'
import type { DomainRepository } from './repository'

export interface DomainController {
    create: (req: Request, res: Response, next: NextFunction) => void
}

export class DomainControllerImpl implements DomainController {
    constructor(private readonly domainRepository: DomainRepository) {}

    create = (req: Request, res: Response, next: NextFunction): void => {
        const domain: Domain = matchedData(req)
        this.domainRepository.create(domain).then(
            _ => res.status(constants.HTTP_STATUS_CREATED).send(),
            (reason: unknown) => {
                next(reason)
            },
        )
    }
}
