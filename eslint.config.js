'use strict'
import eslintJs from '@eslint/js'
import globals from 'globals'
import pluginImport from 'eslint-plugin-import'

export default [
    eslintJs.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
            },
            parserOptions: {
                ecmaVersion: 'latest',
                ecmaFeatures: {
                    impliedStrict: true,
                },
            },
        },
        plugins: {
            import: pluginImport,
        },
        rules: {
            'no-console': [
                'warn',
                {
                    'allow': [
                        'warn',
                        'error',
                    ],
                },
            ],
            'no-debugger': 'warn',
            'sort-imports': [
                'error',
            ],
            'indent': [
                'error',
                4,
                {
                    'SwitchCase': 1,
                },
            ],
            'comma-dangle': [
                'error',
                {
                    'arrays': 'only-multiline',
                    'objects': 'always-multiline',
                    'imports': 'always-multiline',
                    'exports': 'always-multiline',
                    'functions': 'never',
                },
            ],
            'no-floating-decimal': 'off',
            'operator-linebreak': [
                'error',
                'before',
            ],
            'new-parens': [
                'error',
                'always',
            ],
            'generator-star-spacing': [
                'error',
                'after',
            ],
        },
    },
]
