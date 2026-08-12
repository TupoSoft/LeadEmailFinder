import { IProxy } from '@tuposoft/lead-email-finder/common'

export const PROXY_CANDIDATE_REPOSITORY_TOKEN = Symbol('ProxyCandidateRepository')

export interface ProxyCandidate {
    proxy: IProxy
    weight: number
    maxConcurrent: number
    requestsPerMinute: number
}

export interface ProxyCandidateRepository {
    findEligible(mxHost: string, excludedProxyIds: string[]): Promise<ProxyCandidate[]>

    findActiveById(mxHost: string, proxyId: string): Promise<ProxyCandidate | undefined>
}
