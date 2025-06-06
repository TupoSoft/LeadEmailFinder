export interface HttpClient {
    get: <T>(url: string, config?: object) => Promise<T>

    post: <ResponseData>(url: string, data: unknown, config?: object) => Promise<ResponseData>
}
