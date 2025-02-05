import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

export interface HttpClient {
    get: <T>(url: string, config?: object) => Promise<T>

    post: <ResponseData>(url: string, data: unknown, config?: object) => Promise<ResponseData>
}

export class AxiosHttpClient implements HttpClient {
    constructor(private readonly axios: AxiosInstance) {}

    async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const { data } = await this.axios<T>(url, config)
        return data
    }

    async post<ResponseData>(url: string, data: unknown, config?: AxiosRequestConfig): Promise<ResponseData> {
        const { data: responseData } = await this.axios.post<ResponseData, AxiosResponse<ResponseData>, unknown>(
            url,
            data,
            config,
        )
        return responseData
    }
}
