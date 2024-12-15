import type { Logger } from '../logger'
import { jest } from '@jest/globals'

export class PinoLogger implements Logger {
    info: (message: string, meta?: Record<string, unknown>) => void = jest.fn()
    warn: (message: string, meta?: Record<string, unknown>) => void = jest.fn()
    error: (message: string, meta?: Record<string, unknown>) => void = jest.fn()
    debug: (message: string, meta?: Record<string, unknown>) => void = jest.fn()
    child: (bindings: Record<string, unknown>) => Logger = jest.fn<typeof PinoLogger.prototype.child>()
}
