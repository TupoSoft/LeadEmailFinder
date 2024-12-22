import type { NextFunction, Request, Response } from 'express'

export interface EmailScraperController {
    findEmailByName: (req: Request, res: Response, next: NextFunction) => void
}

export class EmailVerificationControllerImpl implements EmailScraperController {
    constructor() {}

    findEmailByName(req: Request, res: Response, next: NextFunction): void {
        this.
    }
}
