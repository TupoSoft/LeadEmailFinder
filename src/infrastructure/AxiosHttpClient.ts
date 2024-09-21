import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import type { HttpClient } from '../application/interfaces/HttpClient'

export class AxiosHttpClient implements HttpClient {
    constructor(private readonly axios: AxiosInstance) {}

    async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const { data } = await this.axios<T>(url, config)
        return data
    }

    async post<ResponseData, RequestData>(
        url: string,
        data: RequestData,
        config?: AxiosRequestConfig,
    ): Promise<ResponseData> {
        const { data: responseData } = await this.axios.post<ResponseData, AxiosResponse<ResponseData>, RequestData>(
            url,
            data,
            config,
        )
        return responseData
    }
}
