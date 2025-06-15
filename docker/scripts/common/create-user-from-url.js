const { URL } = require('url')

function createUserFromUrl({ db, url }) {
    const mongoUrl = new URL(url)
    const { username: user, password: pwd, pathname } = mongoUrl
    const dbName = pathname.slice(1)

    db.createUser({
        user,
        pwd,
        roles: [
            {
                role: 'readWrite',
                db: dbName,
            },
        ],
    })
}

module.exports = {
    createUserFromUrl,
}
