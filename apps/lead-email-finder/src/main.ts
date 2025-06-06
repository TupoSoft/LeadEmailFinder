import { NestFactory } from '@nestjs/core'
import { LeadEmailFinderModule } from './lead-email-finder.module'

async function bootstrap() {
    const app = await NestFactory.create(LeadEmailFinderModule)
    await app.listen(process.env.port ?? 3000)
}

void bootstrap()
