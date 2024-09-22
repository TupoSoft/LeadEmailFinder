export interface HttpClient {
    get: <T>(url: string, config?: object) => Promise<T>

    post: <ResponseData, RequestData>(url: string, data: RequestData, config?: object) => Promise<ResponseData>
}
