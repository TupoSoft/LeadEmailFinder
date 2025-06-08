import { NestFactory } from '@nestjs/core'
import { AsyncEmailVerificationWorkerModule } from './async-email-verification-worker.module'

async function bootstrap() {
    console.log('Starting worker...')

    const app = await NestFactory.create(AsyncEmailVerificationWorkerModule)
    await app.listen(process.env.port ?? 3000)
}

void bootstrap()
