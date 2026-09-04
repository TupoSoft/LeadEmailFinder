import type { INestApplication } from '@nestjs/common'
import type { DestinationStream } from 'pino'
import { pinoHttp } from 'pino-http'
import { createPiiSafePinoHttpOptions } from './pii-safe-logger-options'

export function configurePiiSafeRequestLogging(
    app: Pick<INestApplication, 'use'>,
    destination?: DestinationStream,
): void {
    // Register before Nest's body parsers and Swagger routes so rejected bodies
    // and routes outside Nest controllers also receive safe correlation metadata.
    app.use(pinoHttp(createPiiSafePinoHttpOptions(), destination))
}
