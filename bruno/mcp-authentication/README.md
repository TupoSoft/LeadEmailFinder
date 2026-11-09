# MCP Authentication Collection

MCP (Model Context Protocol) connects AI clients to application tools. This Bruno API-request collection checks
Bearer API keys: a valid key initializes the connector; missing, empty, or incorrect keys are rejected. Invalid keys
return `401 { "error": "authentication_required" }`. Each request validates through the API; the connector does not
exchange or cache OAuth tokens, which delegate authorization to another service.

Start the connector using [its setup guide](../../apps/mcp-server/README.md). Set `MCP_AUTH_BASE_URL` and a customer-scoped
`MCP_AUTH_API_KEY` in the private environment used to run the collection. Keep the API key out of arguments and reports.
