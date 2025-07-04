import { Command } from '@nestjs/cqrs'
import { AddProxyRequest, AddProxyResponse, Auth, Protocol } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'

export class AddProxyCommand extends Command<AddProxyResponse> implements AddProxyRequest {
    constructor(
        public readonly protocol: Protocol,
        public readonly host: string,
        public readonly port: number,
        public readonly auth?: Auth,
        public readonly description?: string,
        public weight: number = 1,
        public enabled: boolean = true,
    ) {
        super()
    }
}
