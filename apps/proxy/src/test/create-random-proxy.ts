import { Auth, Proxy } from '../proxy.schema'
import { faker } from '@faker-js/faker'
import { Types } from 'mongoose'

function createRandomAuth(): Auth {
    return {
        user: faker.internet.username(),
        pass: faker.internet.password(),
    }
}

export function createRandomProxy(): Proxy {
    return {
        _id: new Types.ObjectId(faker.database.mongodbObjectId()),
        auth: createRandomAuth(),
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
