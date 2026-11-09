import { ReadonlyVisitor } from '@nestjs/swagger/dist/plugin'
import { resolve } from 'node:path'
import ts from 'typescript'

describe('Proxy Swagger metadata', () => {
    it('omits credentials from response metadata while retaining the create and update request fields', () => {
        const file = resolve(__dirname, 'proxy.dto.ts')
        const program = ts.createProgram([file], {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            strictNullChecks: true,
            skipLibCheck: true,
        })
        const source = program.getSourceFile(file)!
        const visitor = new ReadonlyVisitor({ pathToSource: __dirname })

        visitor.visit(program, source)
        const models = visitor.collect().models.flatMap(([, classes]) => Object.entries(classes))
        const properties = (name: string): string[] => {
            const metadata = models.find(([modelName]) => modelName === name)?.[1] as unknown as
                | ts.ObjectLiteralExpression
                | undefined
            expect(metadata).toBeDefined()
            return metadata!.properties.map(property => {
                const propertyName = property.name!
                return ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName) ? propertyName.text : ''
            })
        }

        expect(properties('ProxyDto')).not.toContain('auth')
        expect(properties('ProxyDto')).toContain('host')
        expect(properties('ProxyDto')).toContain('blacklists')
        expect(properties('ProxyDto')).not.toContain('user')
        expect(properties('ProxyDto')).not.toContain('pass')
        expect(properties('CreateProxyDto')).toContain('auth')
        expect(properties('UpdateProxyDto')).toContain('auth')
    })
})
