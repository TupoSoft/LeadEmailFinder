import type { FindBulkResponse, FindBulkStatusResponse, FindLeadResult, Lead } from './dto'
import type { LeadFinder } from './finder'
import type { FindLeadBulkResultType, LeadQueue } from './queue'

export class LeadService {
    constructor(
        private readonly leadFinder: LeadFinder,
        private readonly leadQueue: LeadQueue,
    ) {}

    async find(lead: Lead): Promise<FindLeadResult> {
        return await this.leadFinder.findLead(lead)
    }

    async findBulk(leads: Lead[]): Promise<FindBulkResponse> {
        const taskId = await this.leadQueue.addJob('findBulk', { leads })

        return {
            taskId,
            message: 'Request accepted. Starting to find leads.',
            monitorUrl: `https://leademailfinder.com/api/v0/lead/find/bulk/${taskId}/status`,
        }
    }

    async findBulkStatus(id: string): Promise<FindBulkStatusResponse> {
        const status = await this.leadQueue.getStatus(id)

        return {
            status,
        }
    }

    async getFindBulkResult(id: string): Promise<FindLeadBulkResultType> {
        return await this.leadQueue.getResult(id)
    }
}
