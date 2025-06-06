import type { NextFunction, Request, Response } from 'express'

export interface DomainController {
    create: (req: Request, res: Response, next: NextFunction) => void
}
