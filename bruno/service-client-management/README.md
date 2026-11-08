# Service Client Management Collection

A service client is an application using a direct Bearer API key. This Bruno API-request collection requires a
provisioned disposable stack and credentials configured through `environments/local.yml`.

The collection checks that missing authentication returns `401`, and machine keys receive `403` for human-only
create, list, rotate, disable, and delete operations—even in their own organization. Active keys validate at
`GET /v1/auth/api-key` with empty `204`; missing, malformed, and legacy JWT (JSON Web Token) credentials return `401`.
Validation and issuance responses use `Cache-Control: no-store` to prevent retention, including rejection responses.
No collection request creates or rotates a key.

Focused API tests cover successful lifecycle operations, wrong-organization access, permission validation, disabled
rotation, and secret-free lists. Machine rejection alone does not prove those rules.
