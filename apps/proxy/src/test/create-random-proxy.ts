import { Proxy } from '../proxy.schema'
import { faker } from '@faker-js/faker'
import { Types } from 'mongoose'

export function createRandomProxy(): Proxy {
    return {
        _id: new Types.ObjectId(faker.database.mongodbObjectId()),
        protocol: faker.helpers.arrayElement([1, 2, 3]),
        host: faker.internet.domainName(),
        port: faker.internet.port(),
        weight: faker.number.int({ min: 0 }),
        description: faker.lorem.sentence(),
        enabled: faker.datatype.boolean(),
        createdAt: faker.date.past(),
        updatedAt: faker.date.past(),
    }
}
