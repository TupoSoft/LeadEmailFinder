import { NestFactory } from '@nestjs/core'
import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
import { createReservationBootstrapModule } from './reservation-bootstrap-module'

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`Missing required environment variable ${name}`)
    return value
}

async function main(): Promise<void> {
    const postgresUrl = requireEnv('RESERVATION_POSTGRES_URL')
    const organizationId = requireEnv('RESERVATION_ORGANIZATION_ID')
    const operationId = requireEnv('RESERVATION_OPERATION_ID')
    const action = requireEnv('RESERVATION_ACTION')
    const app = await NestFactory.createApplicationContext(createReservationBootstrapModule(postgresUrl), {
        logger: false,
    })
    try {
        const service = app.get(CreditReservationService)
        if (action === 'reserve') {
            const amount = Number(requireEnv('RESERVATION_AMOUNT'))
            if (!Number.isInteger(amount) || amount <= 0) {
                throw new Error('RESERVATION_AMOUNT must be a positive integer')
            }
            await service.reserve(organizationId, { operationId, amount })
        } else if (action === 'release') {
            await service.release(organizationId, operationId)
        } else {
            throw new Error('RESERVATION_ACTION must be reserve or release')
        }
    } finally {
        await app.close()
    }
}

void main().catch(error => {
    console.error('Reservation fixture action failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
})
