'use strict'
import { Configs } from './configs.js'
import { Data } from './data.js'
import { Graphics } from './graphics.js'
import { Grouping } from './grouping.js'
import { Layers } from './layers.js'
import { Layout } from './layout.js'
import { Simulations } from './simulations/simulations.js'
import { Store } from './store.js'
import { Toolbar } from './ui/toolbar.js'
import { UI } from './ui/ui.js'
import { Zoom } from './zoom.js'
import { cleanEventListeners } from './utils.js'

function destroy (diagram, publicInstance) {
    cleanEventListeners(diagram)
    Graphics.teardown(diagram)
    Simulations.teardown(diagram)
    UI.teardown(diagram)

    Object.keys(publicInstance).forEach(key => delete publicInstance[key])
    Object.keys(diagram).forEach(key => delete diagram[key])
    diagram = null // ???
}

function reset (diagram) {
    if (!confirm('Are you sure you want to clear all saved locations and revert all devices to natural float?')) return
    // clear stored layout and zoom
    Layout.clear(diagram)
    Zoom.clear(diagram)
    location.reload()
}

function updateSettings (diagram, newSettings) {
    const flags = ['toolbar', 'grouping', 'floatMode']
    const { settings } = diagram
    let zoomParametersChanged = false

    Object.keys(newSettings).forEach(key => {
        const value = newSettings[key]

        // if value is a boolean flag and is set to change
        if (flags.includes(key) && value !== settings[key]) {
            // validate that flag value is a boolean
            if (typeof value !== 'boolean') {
                throw new Error(`${key} must be a boolean value`)
            }
            // execute the corresponding method
            switch (key) {
                case 'toolbar': {
                    Toolbar.toggle(diagram)
                    break
                }
                case 'grouping': {
                    Grouping.toggle(diagram)
                    break
                }
                case 'floatMode': {
                    Toolbar.toggleFloatMode()
                    break
                }
            }
        } else {
            switch (key) {
                case 'maxZoomIn':
                case 'maxZoomOut': {
                    zoomParametersChanged = true
                    break
                }
                default:
                    break
            }
            settings[key] = value
        }
    })

    if (zoomParametersChanged) {
        Zoom.applySettings(diagram)
    }
}

/**
 * Create a diagram instance
 * @async
 * @function create
 * @param {string} id - An identifier for the diagram. This is used as part of the key to isolate persistent settings in localStorage.
 * @param {Object} container - The container DOM node.
 * @param {Object} settings - Settings object.
 * @param {string[]} settings.configs - list of configs
 * @param {boolean} settings.toolbar - flag for toolbar showing up
 * @param {boolean} settings.grouping - flag for grouping
 * @param {boolean} settings.floatMode - flag for float/lock mode toggle (true = float mode)
 * @param {boolean} [settings.detachable=true] - allow or disallow diagram detach feature (default is to allow)
 * @param {boolean} [settings.customContextMenu=true] - allow or disallow diagram custom context menu feature (default is to allow)
 * @param {number} settings.groupPadding - padding between groups that the simulation tries to maintain
 * @param {number} settings.groupBorderWidth - group border width
 * @param {number} settings.zoomInMult - zoom increment multiplier
 * @param {number} settings.zoomOutMult - zoom decrement multiplier
 * @param {number} settings.maxZoomIn - maximum allowed zoom value
 * @param {number} settings.maxZoomOut - minimum allowed zoom value
 * @return {Object}
 * @throws {Error}
 */
export async function create (id, container, settings = {}) {
    if (!id || (typeof id !== 'string')) {
        throw new Error(`${id} must be a string`)
    }

    const diagram = {
        id,
        dom: { container },
        docEventListeners: [],
        floatModes: {
            floatAll: 0,
            float: 1,
            lock: 2,
            lockAll: 3,
        },
        // weights: {
        //     min: 0,
        //     max: 100,
        // },
        config: {
            name: 'default',
            isSet: false,
            groups: [],
            devices: [],
            subnets: [],
            layout: {},
        },
        focusedGroupID: -1,
        currentWeight: 1,
        subnetWeight: 0,
    }

    diagram.settings = Object.assign({
        configs: null,
        toolbar: false,
        grouping: Store.get(diagram, 'grouping') !== 'false',
        floatMode: diagram.floatModes.float,
        groupPadding: 95,
        groupBorderWidth: 10,
        zoomInMult: 1.25,
        zoomOutMult: 0.8,
        maxZoomIn: 8,
        maxZoomOut: 0.1,
        detachable: true,
        customContextMenu: true,
    }, settings)

    Configs.init(diagram)
    UI.create(diagram, container)
    const layer = await Layers.push('main', diagram, Data.fetch('api/diagramlayer3.json'))
    layer.processing = false
    Simulations.init(diagram, layer)
    Grouping.init(diagram, layer)
    Layout.restore(diagram, layer)
    Zoom.restore(diagram, layer)
    Graphics.fetchStatus(diagram)

    return {
        destroy () { destroy(diagram, this) },
        reset: () => reset(diagram),
        doVisioExport: () => Toolbar.doVisioExport(diagram),
        updateSettings: newSettings => updateSettings(diagram, newSettings),
        toggleFloatMode: mode => Toolbar.toggleFloatMode(diagram, mode),
        toggleGrouping: () => Grouping.toggle(diagram),
        toggleToolbar: () => Toolbar.toggle(diagram),
        createConfig: name => {
            diagram.id = name
            Configs.createConfig(diagram)
            Toolbar.toggleFloatMode(diagram, diagram.config.floatMode)
            Layers.refreshLayer(diagram)
        },
        deleteConfig: name => {
            Configs.deleteConfig(diagram, name)
            Layout.clear({ id: name })
            Zoom.clear({ id: name })
        },
        selectConfig: name => {
            diagram.id = name
            Configs.selectConfig(diagram)
            Toolbar.toggleFloatMode(diagram, diagram.config.floatMode)
            Layers.refreshLayer(diagram)
        },
        getConfig: () => {
            const config = Configs.getConfig(diagram)
            config.groups = Array.from(config.groups)
            config.devices = Array.from(config.devices)
            config.subnets = Array.from(config.subnets)
            return config
        },
        applyConfig: config => {
            const cfg = structuredClone(config)
            cfg.groups = new Set(cfg.groups)
            cfg.devices = new Set(cfg.devices)
            cfg.subnets = new Set(cfg.subnets)
            Configs.applyConfig(diagram, cfg)
            Toolbar.toggleFloatMode(diagram, diagram.config.floatMode)
            Layers.refreshLayer(diagram)
        },
        resetConfig: () => {
            Configs.resetConfig(diagram)
            Toolbar.toggleFloatMode(diagram, diagram.config.floatMode)
            Layers.refreshLayer(diagram)
        },
    }
}
