import { bootstrap } from '@tuposoft/lead-email-finder/grpc'
import { ApiKeyModule } from './api-key.module'

void bootstrap({ module: ApiKeyModule, protoPackage: 'api_key' })
