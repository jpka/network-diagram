'use strict'
import ESLintPlugin from 'eslint-webpack-plugin'
import { EsbuildPlugin } from 'esbuild-loader'
import { URL } from 'url'
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
    },
}
