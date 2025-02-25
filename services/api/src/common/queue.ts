import type { JobStatus } from './enums'

export interface GetStatusResponse {
    status: JobStatus
}

export interface Queue<DataType, ResultType, NameType, StatusType = GetStatusResponse> {
    addJob: (name: NameType, data: DataType) => Promise<string>
    getStatus: (id: string) => Promise<StatusType>
    getResult: (id: string) => Promise<ResultType>
}
