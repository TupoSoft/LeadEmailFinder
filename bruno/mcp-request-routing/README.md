# MCP Request Routing Collection

MCP (Model Context Protocol) connects AI clients to application tools. This Bruno API-request collection needs no
credential and checks six routing outcomes: public health, unknown-path `404`, unsupported `/mcp` methods returning
`405`, malformed double-slash targets returning `400`, and continued health afterward.

Start the connector using [its setup guide](../../apps/mcp-server/README.md), then run:

```shell
cd bruno/mcp-request-routing
corepack pnpm exec bru run --env local --env-var baseUrl=http://localhost:3002
```

Use the connector's actual host and port for `baseUrl`. The connector still requires its API URL for authenticated
requests. Raw HTTP tests separately cover malformed absolute-form request targets, which Bruno cannot represent.
