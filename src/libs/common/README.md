# Common Contracts

[`src/index.ts`](src/index.ts) exports shared types, injection tokens (runtime dependency identifiers), enums,
and pure utilities. Business modules can use them without importing another module's implementation or the API host.

## Customer-Object Write Security

`CustomerObjectWriteSecurity` describes mandatory protection for stored customer/individual data. Production requires
authenticated HTTPS intent, explicit `aws:kms` encryption, one configured KMS key, and `no-store` cache control.
**KMS** is AWS Key Management Service; **SSE-KMS** means server-side encryption using its key. `no-store` forbids caching.
The disposable Garage storage fixture omits KMS fields but retains `no-store`.

The API composition root (dependency wiring) creates/freezes one validated value under
`CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN`. Infrastructure adapters translate it into provider request fields.
Common imports no AWS software development kit, configuration, or business module for this contract.

## Test Support

[`customer-object-write-security.contract.ts`](src/testing/customer-object-write-security.contract.ts) checks production
SSE-KMS and development mappings. It is exported only through the testing-specific deep barrel, not production exports.

## Validation

Email-verification input/result adapter tests and API factory/module tests exercise the mappings.
Review imports against the [business-module dependency rules](../modules/README.md).
