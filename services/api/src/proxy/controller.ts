import type { NextFunction, Request, Response } from 'express'
import { constants } from 'node:http2'
import type { ProxyFvo } from './dto'
import type { ProxyRepository } from './repository'

export interface IProxyController {
    getAll: (req: Request, res: Response, next: NextFunction) => void
    create: (req: Request<unknown, unknown, ProxyFvo>, res: Response, next: NextFunction) => void
}

export class ProxyController implements IProxyController {
    constructor(private readonly proxyRepository: ProxyRepository) {}

    create: (req: Request<unknown, unknown, ProxyFvo>, res: Response, next: NextFunction) => void = (
        req,
        res,
    ): void => {
        const { body } = req

        this.proxyRepository
            .create(body)
            .then(proxy => res.status(constants.HTTP_STATUS_CREATED).json(proxy))
            .catch((reason: unknown) => {
                res.status(constants.HTTP_STATUS_INTERNAL_SERVER_ERROR).json(reason)
            })
    }

    getAll: (req: Request, res: Response, next: NextFunction) => void = (req, res) => {
        this.proxyRepository
            .getAll()
            .then(proxies => res.json(proxies))
            .catch((reason: unknown) => {
                res.status(constants.HTTP_STATUS_INTERNAL_SERVER_ERROR).json(reason)
            })
    }
}
