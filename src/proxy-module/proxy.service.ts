import { Injectable } from '@nestjs/common'
import { IProxyService } from './interfaces'
import { Model, RootFilterQuery, Types } from 'mongoose'
import { ProxyResponse, UpdateProxyDto } from './dto'
import { Proxy } from './proxy.schema'
import { InjectModel } from '@nestjs/mongoose'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { ProxyNotFoundException } from './exceptions'

@Injectable()
export class ProxyService implements IProxyService {
    constructor(
        @InjectModel(Proxy.name) private readonly proxyModel: Model<Proxy>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    async update(id: string, updateProxyDto: UpdateProxyDto): Promise<ProxyResponse> {
        if (!Types.ObjectId.isValid(id)) {
            throw new ProxyNotFoundException(id)
        }

        const updated = await this.proxyModel.findByIdAndUpdate(id, updateProxyDto, { new: true }).exec()

        if (updated === null) {
            throw new ProxyNotFoundException(id)
        }

        return this.mapper.map(updated, Proxy, ProxyResponse)
    }

    async remove(id: string): Promise<ProxyResponse> {
        if (!Types.ObjectId.isValid(id)) {
            throw new ProxyNotFoundException(id)
        }

        const removed = await this.proxyModel.findByIdAndDelete(id).exec()

        if (!removed) {
            throw new ProxyNotFoundException(id)
        }

        return this.mapper.map(removed, Proxy, ProxyResponse)
    }

    async addToBlacklist(id: string, blacklist: string): Promise<ProxyResponse> {
        if (!Types.ObjectId.isValid(id)) {
            throw new ProxyNotFoundException(id)
        }

        const updated = await this.proxyModel
            .findByIdAndUpdate(id, { $addToSet: { blacklists: blacklist } }, { new: true, upsert: false })
            .exec()

        if (updated === null) {
            throw new ProxyNotFoundException(id)
        }

        return this.mapper.map(updated, Proxy, ProxyResponse)
    }

    async getById(id: string): Promise<ProxyResponse> {
        if (!Types.ObjectId.isValid(id)) {
            throw new ProxyNotFoundException(id)
        }

        const proxy = await this.proxyModel.findById(id).exec()

        if (proxy === null) {
            throw new ProxyNotFoundException(id)
        }

        return this.mapper.map(proxy, Proxy, ProxyResponse)
    }

    async get(filter: RootFilterQuery<Proxy>): Promise<ProxyResponse[]> {
        const proxies = await this.proxyModel.find(filter).exec()
        return this.mapper.mapArray(proxies, Proxy, ProxyResponse)
    }
}
