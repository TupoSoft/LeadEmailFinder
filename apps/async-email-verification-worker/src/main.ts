import { NestFactory } from '@nestjs/core'
import { AsyncEmailVerificationWorkerModule } from './async-email-verification-worker.module'

async function bootstrap() {
    const app = await NestFactory.create(AsyncEmailVerificationWorkerModule)
    await app.init()
}

void bootstrap()
