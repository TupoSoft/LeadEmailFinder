import type { Router } from 'express'
import type { IProxyController } from './controller'
import { authenticate } from '../middleware'

export class ProxyRouter {
    public static readonly PATH = '/proxy'

    constructor(
        private readonly router: Router,
        private readonly proxyController: IProxyController,
    ) {}

    init(): void {
        this.router.get(ProxyRouter.PATH, authenticate, this.proxyController.getAll)
        this.router.post(ProxyRouter.PATH, authenticate, this.proxyController.create)
    }
}
