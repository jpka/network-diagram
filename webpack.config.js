'use strict'
import ESLintPlugin from 'eslint-webpack-plugin'
import { EsbuildPlugin } from 'esbuild-loader'
import { URL } from 'url'
import { readFileSync } from 'fs'
// import webpack from 'webpack'

// const NODE_ENV = process.env.NODE_ENV || 'production'

// console.log(process.env.NODE_ENV)

export default {
    // mode: NODE_ENV,
    target: 'web',

    node: {
        global: false,
        __filename: false,
        __dirname: false,
    },
    //
    // externals: {
    //     d3: 'd3',
    //     'd3-zoom': 'd3-zoom',
    //     'd3-quadtree': 'd3-quadtree',
    //     'd3-force': 'd3-force',
    //     'd3-scale': 'd3-scale',
    //     'd3-drag': 'd3-drag',
    //     'd3-fetch': 'd3-fetch',
    //     'd3-ease': 'd3-ease',
    //     'd3-polygon': 'd3-polygon',
    // },

    entry: './src/index.js',

    output: {
        clean: true,
        path: new URL('./dist', import.meta.url).pathname,
        filename: 'diagram-layer3.js',
        globalObject: 'this',
        library: {
            name: 'Diagram',
            type: 'umd',
        },
    },

    module: {
        rules: [
            {
                test: /\.js$/i,
                loader: 'esbuild-loader',
                options: {
                    loader: 'js',
                    target: 'es2022',
                },
            },
            {
                test: /\.(png|svg|jpe?g|gif)$/i,
                type: 'asset',
                generator: {
                    filename: 'assets/img/[name][ext]?v=[hash]',
                },
            },
        ],
    },

    stats: {
        preset: 'errors-warnings',
        outputPath: true,
        assets: true,
        colors: true,
        version: false,
    },

    plugins: [
        // new webpack.DefinePlugin({
        //     'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
        // }),

        // new ESLintPlugin({
        //     configType: 'flat',
        //     extensions: ['js', 'cjs', 'mjs'],
        // }),
    ],

    optimization: {
        minimizer: [
            new EsbuildPlugin({
                target: 'es2022',
                format: undefined,
                // minify: NODE_ENV === 'production',
                // css: NODE_ENV === 'production',
            }),
        ],
    },

    devServer: {
        client: {
            overlay: false,
        },
        host: '0.0.0.0',
        port: 8080,
        static: {
            directory: new URL('./public', import.meta.url).pathname,
        },
        // allow adding express-style routes for custom API endpoints
        setupMiddlewares: (middlewares, devServer) => {
            if (!devServer || !devServer.app) return middlewares

            const app = devServer.app

            app.get('/api/diagram/subnet/:name.json', (req, res) => {
                const fileUrl = new URL(`./public/api/diagram-subnet-1.json`, import.meta.url).pathname
                const data = JSON.parse(readFileSync(fileUrl, 'utf8'))
                data.links.forEach(link => {
                    //assign one status at random
                    link.status = ["ok", "issues", "warning", "offline", "down"][Math.floor(Math.random() * 5)];
                })
                res.json(data)
            })
            app.get('/api/diagram/device/:name.json', (req, res) => {
                const fileUrl = new URL(`./public/api/diagram-device-1.json`, import.meta.url).pathname
                // replace Dubonnet device (central one) in mock with the one requested
                const data = readFileSync(fileUrl, 'utf8')
                const modifiedData = data.replace(/Dubonnet/g, req.params.name)
                res.json(JSON.parse(modifiedData))
            })
            // Generic handler: serve files from ./public/api for requests to /api/*
            app.get('/api/*', (req, res) => {
                const reqPath = req.path // e.g. /api/diagramlayer3.json
                const fileUrl = new URL(`./public${reqPath}`, import.meta.url).pathname
                res.sendFile(fileUrl, err => {
                    if (!err) return
                    if (reqPath.endsWith('/diagram/subnet.json') && req.query) {
                        const candidate = new URL(`./public/api/diagramlayer2.json?device=${req.query.device}`, import.meta.url).pathname
                        res.sendFile(candidate, err2 => {
                            if (err2) res.status(404).json({ error: 'not found' })
                        })
                        return
                    }
                    res.status(404).json({ error: 'not found' })
                })
            })

            return middlewares
        },
    },
}
