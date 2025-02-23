import { MongoEmailRepository } from './mongo-repository'
import type { Db } from 'mongodb'
import { EmailController } from './controller'
import type { Logger } from 'logging'
import type { Router } from 'express'
import { EmailRouter } from './router'
import type { AuthMiddleware } from '../middleware'

export interface IEmailModule {
    repository: MongoEmailRepository
}

export class EmailModule implements IEmailModule {
    private isInitialized = false

    constructor(
        private readonly db: Db,
        private readonly logger: Logger,
        private readonly router: Router,
        private readonly authMiddleware: AuthMiddleware,
    ) {}

    private _repository?: MongoEmailRepository

    get repository(): MongoEmailRepository {
        if (this._repository == null) {
            throw new Error('Repository is not initialized')
        }

        return this._repository
    }

    init = (): void => {
        if (this.isInitialized) {
            return
        }

        this._repository = new MongoEmailRepository(this.db)

        const controller = new EmailController(this._repository, this.logger)
        const router = new EmailRouter(this.router, controller, this.authMiddleware)
        router.init()

        this.isInitialized = true
    }
}
