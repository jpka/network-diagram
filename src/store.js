'use strict'
import { parseJSON } from './utils.js'

// localStorage feature detection
const hasStorage = (() => {
    let mod = 'storage test'
    try {
        localStorage.setItem(mod, mod)
        localStorage.removeItem(mod)
        return true
    } catch {
        return false
    }
})()

// -- storage --
export const Store = {
    keyPrefix: 'diagrams',

    key ({ id }, path) {
        return `${this.keyPrefix}.${id}.${path}`
    },

    set (diagram, key, value) {
        if (!hasStorage) return false
        localStorage.setItem(this.key(diagram, key), value)
        return true
    },

    get (diagram, key) {
        if (!hasStorage) return null
        return localStorage.getItem(this.key(diagram, key))
    },

    getParsed (diagram, key) {
        return parseJSON(this.get(diagram, key))
    },

    remove (diagram, key) {
        if (!hasStorage) return false
        localStorage.removeItem(this.key(diagram, key))
    },

    purge ({ settings }) {
        if (!Array.isArray(settings.configs)) return
        const except = settings.configs.map(id => this.key({ id },  ''))
        Object.keys(localStorage).forEach(lsKey => {
            if (!lsKey.startsWith(this.keyPrefix + '.')) return
            if (except.some(ex => lsKey.startsWith(ex))) return
            localStorage.removeItem(lsKey)
        })
    },
}
