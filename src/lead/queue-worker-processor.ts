import { Processor } from 'bullmq'
import { getRedis } from '../util/redis'
import { FindLeadBulkDataType, FindLeadBulkResultType, LeadQueueNameType } from './queue'
import { LeadFinder } from './finder'
import {
    CatchAllVerifier,
    EmailVerificationService,
    EmailVerifier,
    MongoEmailVerificationRepository,
    RedisCatchAllCache,
} from '../email-verification'
import { RedisConnectionLimiter, SmtpClientCreatorImpl, SMTPVerifier } from '../smtp'
import { DNSCacheImpl } from '../dns'
import { MongoProxyRepository, ProxyService } from '../proxy'
import { getMongoClient } from '../util/mongo'
import { PinoLogger } from '../logging'
import pino from 'pino'
import { AxiosHttpClient } from '../http-client'
import axios from 'axios'
import { FindLeadResult } from './dto'

async function createLeadFinder(): Promise<LeadFinder> {
    const redis = await getRedis()
    const mongoClient = await getMongoClient()
    const logger = new PinoLogger(pino())
    const db = mongoClient.db()
    const dnsCache = new DNSCacheImpl(redis)
    const proxyRepository = new MongoProxyRepository(db)
    const proxyService = new ProxyService(proxyRepository)
    const connectionLimiter = new RedisConnectionLimiter(redis, logger)
    const smtpClientCreator = new SmtpClientCreatorImpl(connectionLimiter, logger)
    const catchAllCache = new RedisCatchAllCache(redis)
    const smtpVerifier = new SMTPVerifier(dnsCache, catchAllCache, proxyService, smtpClientCreator)
    const httpClient = new AxiosHttpClient(axios)
    const catchAllVerifier = new CatchAllVerifier(httpClient)
    const emailVerifier = new EmailVerifier(smtpVerifier, catchAllVerifier, logger)
    const emailVerificationRepository = new MongoEmailVerificationRepository(db)
    const emailVerificationService = new EmailVerificationService(emailVerifier, emailVerificationRepository)
    return new LeadFinder(emailVerificationService, logger)
}

const processor: Processor<FindLeadBulkDataType, FindLeadBulkResultType, LeadQueueNameType> = async job => {
    const {
        data: { leads },
    } = job

    const leadFinder = await createLeadFinder()

    const findLeadResults: FindLeadResult[] = []
    for (const lead of leads) {
        const result = await leadFinder.findLead(lead)
        findLeadResults.push(result)
        await job.updateProgress((findLeadResults.length / leads.length) * 100)
    }

    return { findLeadResults }
}

export default processor
