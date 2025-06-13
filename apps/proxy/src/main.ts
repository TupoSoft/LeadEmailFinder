import { NestFactory } from '@nestjs/core'
import { ProxyModule } from './proxy.module'

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(ProxyModule)
    await app.listen(process.env.port ?? 3000)
}

void bootstrap()
