'use strict'
import { Store } from './store.js'

const storageKey = 'config'

function createDefaultConfig (diagram) {
    return {
        floatMode: diagram.floatModes.floatAll,
        isSet: false,
        groups: new Set(),
        devices: new Set(),
        subnets: new Set(),
    }
}
function saveConfig (diagram, config) {
    const existingConfig = Store.get(diagram, storageKey)
    let newConfig = structuredClone(config)

    const allGroups = newConfig.groups.size === diagram.data.groups.length
    const allDevices = newConfig.devices.size === diagram.data.devices.length
    const allSubnets = newConfig.subnets.size === diagram.data.subnets.length

    if (allGroups && allDevices && allSubnets) {
        Store.remove(diagram, storageKey)
        return
    }

    newConfig.groups = Array.from(newConfig.groups).sort()
    newConfig.devices = Array.from(newConfig.devices).sort()
    newConfig.subnets = Array.from(newConfig.subnets).sort()

    newConfig = JSON.stringify(newConfig)

    if (existingConfig !== newConfig) {
        Store.set(diagram, storageKey, newConfig)
    }
}

function getConfig (diagram) {
    const config = Store.getParsed(diagram, storageKey)

    if (!config || (typeof config !== 'object')) {
        return createDefaultConfig(diagram)
    }

    config.groups = new Set(config.groups)
    config.devices = new Set(config.devices)
    config.subnets = new Set(config.subnets)
    return config
}

function createConfig (diagram) {
    const config = getConfig(diagram)

    diagram.config = config

    saveConfig(diagram, config)
}

function deleteConfig (id) {
    Store.remove({ id }, storageKey)
}

function storeConfig (diagram) {
    const config = getConfig(diagram)

    const updatedConfig = diagram.config
    updatedConfig.floatMode = diagram.settings.floatMode

    if (config !== updatedConfig) {
        Object.assign(config, updatedConfig)
    }

    saveConfig(diagram, config)
}

function init (diagram) {
    Store.purge(diagram)
    diagram.config = getConfig(diagram)
    diagram.settings.floatMode = diagram.config.floatMode
}

function selectConfig (diagram) {
    const config = getConfig(diagram)

    if (!config) {
        return false
    }

    diagram.config = config
}

function applyConfig (diagram, config) {
    const newConfig = structuredClone(config)

    Object.assign(diagram.config, newConfig)
    storeConfig(diagram)
}

function resetConfig (diagram) {
    const defaultConfig = createDefaultConfig(diagram)

    Object.assign(diagram.config, defaultConfig)
    storeConfig(diagram)
}

export const Configs = {
    init,
    getConfig,
    createConfig,
    deleteConfig,
    selectConfig,
    storeConfig,
    applyConfig,
    resetConfig,
}
