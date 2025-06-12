const { readFileSync } = require('node:fs')
const assert = require('node:assert')
const { URL } = require('url')
const { env } = process

const { APIKEY_MONGO_URL_FILE: mongoUrlFilePath, ADMIN_APIKEY_FILE: adminApikeyFilePath } = env

if (mongoUrlFilePath === undefined) {
    console.error(`The MONGO_URL_FILE variable is undefined.`)
    process.exit(1)
}

const mongoUrlFile = readFileSync(mongoUrlFilePath, 'utf-8')
const mongoUrl = new URL(mongoUrlFile)
const { username: user, password: pwd, pathname } = mongoUrl
const dbName = pathname.slice(1)

db = db.getSiblingDB(dbName)

const { ok } = db.createUser({
    user,
    pwd,
    roles: [
        {
            role: 'readWrite',
            db: dbName,
        },
    ],
})

if (ok) {
    console.log(`The database ${dbName} with user '${user}' and password ${pwd} was successfully created.`)
} else {
    console.error(`Something went wrong while creating the user.`)
}

const isNonEmptyString = val => typeof val === 'string' && !!val

assert.ok(isNonEmptyString(adminApikeyFilePath), 'ADMIN_APIKEY_FILE must be a non-empty string')

const adminApikeyFile = readFileSync(adminApikeyFilePath, 'utf-8')
const token = adminApikeyFile.toString().replace(/\s+/g, '')

db.keys.insertOne({
    token,
    permissions: ['admin'],
    description: 'Hardcoded key for local env',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
})
