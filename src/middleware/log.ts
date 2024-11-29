import type { NextFunction, Request, Response } from 'express'

export const log = (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now()

    console.log(`[${new Date().toISOString()}] Request Body:`, req.body)
    console.log(`[${new Date().toISOString()}] Request Params:`, req.params)

    const originalSend = res.send
    const originalJson = res.json

    let responseBody: unknown = {}

    res.send = (body: unknown) => {
        responseBody = body
        return originalSend.call(res, body)
    }

    res.json = (body: unknown) => {
        responseBody = body
        return originalJson.call(res, body)
    }

    res.on('finish', () => {
        const duration = Date.now() - start
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`)
        console.log(`[${new Date().toISOString()}] Response Body:`, responseBody)
    })

    next()
}
