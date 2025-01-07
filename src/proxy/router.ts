import type { Router } from 'express'
import type { IProxyController } from './controller'
import { type IAuthMiddleware, validateRequest } from '../middleware'
import { createProxySchema } from './validation'

export class ProxyRouter {
    public static readonly PATH = '/proxy'

    constructor(
        private readonly router: Router,
        private readonly proxyController: IProxyController,
        private readonly authMiddleware: IAuthMiddleware,
    ) {}

    init(): void {
        this.router.get(
            ProxyRouter.PATH,
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            this.proxyController.getAll,
        )
        this.router.post(
            ProxyRouter.PATH,
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            validateRequest(createProxySchema, 'body'),
            this.proxyController.create,
        )
    }
}
