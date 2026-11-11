// @ts-check
import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'

export default tseslint.config(
    {
        ignores: [
            'eslint.config.mjs',
            'apps/web/**',
            '**/dist/**',
            '**/.cloudflare/**',
            '**/.wrangler/**',
            '**/worker-configuration.d.ts',
            '.dev/**',
            'deploy/**',
            '**/metadata.ts',
            'packages/api-client/src/schema.d.ts',
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        plugins: {
            import: importPlugin,
        },
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest,
            },
            sourceType: 'commonjs',
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        settings: {
            'import/resolver': {
                typescript: true,
                node: true,
            },
        },
    },
    {
        files: ['apps/api/worker/**/*.ts', 'apps/api/scripts/**/*.ts', 'apps/api/drizzle.config.ts'],
        languageOptions: {
            parserOptions: {
                projectService: false,
                project: './apps/api/tsconfig.worker.json',
            },
        },
    },
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn',
            '@typescript-eslint/explicit-function-return-type': [
                'warn',
                {
                    allowExpressions: true,
                    allowHigherOrderFunctions: true,
                    allowTypedFunctionExpressions: true,
                    allowDirectConstAssertionInArrowFunctions: true,
                },
            ],
        },
    },
    {
        files: ['**/*.spec.ts', '**/*.spec.service.ts'],
        rules: {
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
        },
    },
)
