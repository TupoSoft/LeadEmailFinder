import { bootstrapDevelopmentApiKey } from './bootstrap-service-credential'

void bootstrapDevelopmentApiKey('platform')
    .then(() => {
        console.log('Seeded platform API-key fixture in .dev/auth/platform-api-key.json')
    })
    .catch(() => {
        console.error('Platform API-key bootstrap failed; raw output withheld to protect credentials')
        process.exitCode = 1
    })
