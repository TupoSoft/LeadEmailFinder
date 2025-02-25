import type { FindBulkResponse, FindLeadRequest, FindLeadResult } from './dto'
import type { LeadFinder } from './finder'
import type { LeadQueue, LeadQueueResultType } from './queue'
import { FIND_LEAD_BULK_STATUS_ROUTE } from './constants'
import type { BulkStatusResponse } from '../common'

export class LeadService {
    constructor(
        private readonly leadFinder: LeadFinder,
        private readonly leadQueue: LeadQueue,
    ) {}

    async find(lead: FindLeadRequest): Promise<FindLeadResult> {
        return await this.leadFinder.findLead(lead)
    }

    async findBulk(leads: FindLeadRequest[]): Promise<FindBulkResponse> {
        const taskId = await this.leadQueue.addJob('findBulk', leads)

        return {
            taskId,
            message: 'Request accepted. Starting to find leads.',
            monitorUrl: FIND_LEAD_BULK_STATUS_ROUTE.replace(':id', taskId),
        }
    }

    async findBulkStatus(id: string): Promise<BulkStatusResponse> {
        return await this.leadQueue.getStatus(id)
    }

    async getFindBulkResult(id: string): Promise<LeadQueueResultType> {
        return await this.leadQueue.getResult(id)
    }
}
