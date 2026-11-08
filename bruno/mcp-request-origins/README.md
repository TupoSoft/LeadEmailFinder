# MCP Request Origins Collection

MCP (Model Context Protocol) connects AI clients to tools. Origin identifies the caller's scheme, host, and port.
This seven-request Bruno collection checks origin-before-authentication enforcement, allowed/denied origins, native
clients without Origin, and invalid credentials. Raw duplicate-header cases use
`apps/mcp-server/src/request-origin.integration.spec.ts`.

Start the connector using [its setup guide](../../apps/mcp-server/README.md) with
`MCP_ALLOWED_ORIGINS=https://client.example`. Configure a customer-scoped `MCP_AUTH_API_KEY` in the private collection
environment and set `baseUrl` to the connector address. Keep keys out of arguments and reports; stop the connector
afterward.
