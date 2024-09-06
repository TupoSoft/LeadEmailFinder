db.createUser({
    user: 'verifier',
    pwd: 'verifier',
    roles: [
        {
            role: 'readWrite',
            db: 'verifier',
        },
    ],
})
