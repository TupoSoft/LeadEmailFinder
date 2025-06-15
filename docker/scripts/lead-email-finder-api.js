const { readFileSync } = require('fs')
const { URL } = require('url')
const { createUserFromUrl } = require(`common/create-user-from-url.js`)

const { env } = process
const { MONGO_URL_FILE: mongoUrlFilePath } = env

if (mongoUrlFilePath === undefined) {
    console.error(`The MONGO_URL_FILE variable is undefined.`)
    process.exit(1)
}

const mongoUrlFile = readFileSync(mongoUrlFilePath, 'utf-8')
const mongoUrl = new URL(mongoUrlFile)
const { pathname } = mongoUrl
const dbName = pathname.slice(1)

db = db.getSiblingDB(dbName)

createUserFromUrl({ db, url: mongoUrl })
