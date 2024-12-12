import type { Router } from 'express'
import type { IProxyController } from './controller'
import { authenticate, validateRequest } from '../middleware'
import { createProxySchema } from './validation'

export class ProxyRouter {
    public static readonly PATH = '/proxy'

    constructor(
        private readonly router: Router,
        private readonly proxyController: IProxyController,
    ) {}

    init(): void {
        this.router.get(ProxyRouter.PATH, authenticate, this.proxyController.getAll)
        this.router.post(
            ProxyRouter.PATH,
            authenticate,
            validateRequest(createProxySchema, 'body'),
            this.proxyController.create,
        )
    }
}
