# Proxy Registry Collection

This Bruno API-request collection requires a provisioned disposable stack and the platform API key configured in
`environments/local.yml`. Supply synthetic credentials for proxy fixtures; keep real credentials out of reports.

A proxy forwards verification traffic. The collection checks authentication, creation disabled by default,
credential-free responses, updates with omitted or replaced credentials, lifecycle changes, blacklist deduplication,
and deletion. Pagination uses a cursor, an opaque continuation value; traversal, terminal and malformed cursors are
checked. Create/update responses use `Cache-Control: no-store`, including rejections.

Two labeled proxies start disabled. One is briefly activated, drained, disabled, and blacklisted. Draining excludes
new allocation but does not prove that existing leases—temporary ownership of a proxy—have finished. Only captured
fixture IDs are deleted. If interrupted, inspect descriptions
starting `Bruno proxy-registry` and remove only confirmed fixture IDs.

HTTP responses cannot prove that an omitted credential update preserved stored credentials; focused backend tests
cover that persistence rule.
