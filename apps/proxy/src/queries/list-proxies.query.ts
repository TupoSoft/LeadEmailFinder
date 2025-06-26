import { Injectable } from '@nestjs/common'
import { Query } from '@nestjs/cqrs'
import { ListProxiesRequest, ListProxiesResponse } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'

@Injectable()
export class ListProxiesQuery extends Query<ListProxiesResponse> implements ListProxiesRequest {
    constructor(
        public readonly pageSize: number,
        public readonly pageToken: string | undefined,
    ) {
        super()
    }
}
