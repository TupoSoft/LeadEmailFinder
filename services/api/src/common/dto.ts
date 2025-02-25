export interface BulkResponse {
    message: string
    taskId: string
    monitorUrl: string
}

export interface BulkProgressResponse {
    total: number
    processed: number
}

export interface BulkStatusResponse extends BulkProgressResponse {
    status: string
}
