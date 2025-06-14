import { ProxyModule } from './proxy.module'
import { bootstrap } from '@tuposoft/lead-email-finder/grpc'

void bootstrap({ module: ProxyModule, protoPackage: 'proxy' })
