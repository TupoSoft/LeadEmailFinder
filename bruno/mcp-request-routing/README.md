# MCP Request Routing Bruno Collection

Six requests check the connector's HTTP routing. Health remains public, unknown paths return 404, and GET or DELETE
requests to `/mcp` return 405. A double-slash request target returns 400 without stopping the process. A final health
request confirms that the connector remains available.

These routing checks need no credential. The connector still needs its API URL configured for authenticated MCP
requests. Build and start it using the local setup in `apps/mcp-server/README.md`, then run this collection with
`bru run --env local` from its directory. Set `baseUrl` to the connector's current host and port.

The malformed absolute-form target with an unbalanced bracket cannot be represented by an ordinary Bruno URL.
The focused Node HTTP integration suite covers that raw request and the process-survival behavior.
