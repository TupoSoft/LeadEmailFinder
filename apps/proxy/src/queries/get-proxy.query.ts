import { Query } from '@nestjs/cqrs'
import { GetProxyRequest, GetProxyResponse } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'

export class GetProxyQuery extends Query<GetProxyResponse> implements GetProxyRequest {
    constructor(public readonly id: string) {
        super()
    }
}
