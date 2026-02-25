'use strict'
import { zoom as d3Zoom, zoomIdentity as d3ZoomIdentity } from 'd3-zoom'
import { debounce, parseJSON } from './utils.js'
import { Simulations } from './simulations/simulations.js'
import { Store } from './store.js'

const Transform = {
    storageKey: 'transform',
    // debounced to avoid storing in localStorage multiple times during zoom or other events
    save: debounce(function (diagram, value) {
        return Store.set(diagram, this.storageKey, JSON.stringify(value))
    }, 1000),
    clear (diagram) {
        Store.remove(diagram, this.storageKey)
    },
    get (diagram) {
        const { dom, settings } = diagram
        // return either the provided value, the stored transform or the default one
        return parseJSON(settings.transform)
            ?? Store.getParsed(diagram, this.storageKey)
            ?? { x: dom.svg.node().clientWidth / 2, y: dom.svg.node().clientHeight / 2, k: 0.4 }
    },
}

function scale (layer, by) {
    let { zoomBehavior, dom, focusedGroup } = layer
    if (focusedGroup > -1) return

    zoomBehavior.scaleBy(dom.svg.transition().duration(200), by)
}

function increment (layer) {
    scale(layer, layer.settings.zoomInMult)
}

function decrement (layer) {
    scale(layer, layer.settings.zoomOutMult)
}

function restore (diagram, layer) {
    const transform = Transform.get(diagram)
    // restore saved transform or set the default one
    layer.dom.svg.call(diagram.zoomBehavior.transform, d3ZoomIdentity.translate(transform.x, transform.y).scale(transform.k))
}

function applySettings ({ settings, zoomBehavior }) {
    zoomBehavior.scaleExtent([settings.maxZoomOut, settings.maxZoomIn])
}

function clear (diagram) {
    Transform.clear(diagram)
}

function onWheelScroll (layer) {
    return function (event) {
        const { focusedGroup, settings } = layer
        let delta

        // if a group is focused don't zoom
        if (focusedGroup > -1) return

        if (event.wheelDelta) {
            delta = event.wheelDelta
        } else {
            delta = -1 * event.deltaY
        }

        scale(layer, delta > 0 ? settings.zoomInMult : settings.zoomOutMult)
    }
}

function init (diagram, layer) {
    const { dom } = layer

    layer.zoomBehavior = d3Zoom()
        .on('zoom', event => {
            // don't zoom if a group is focused
            if (layer.focusedGroup > -1 && event.sourceEvent && event.sourceEvent.type === 'mousemove') return

            layer.transform = event.transform
            dom.layerContainer.attr('transform', event.transform)
        })
        .on('end', event => {
            // save only when on main layer
            if (diagram.layers.length === 1) {
                Transform.save(diagram, event.transform)
            }
        })
    applySettings(diagram)

    dom.svg.call(layer.zoomBehavior)
        .on('wheel.zoom', null)
        .on('dblclick.zoom', null)
    dom.svg.node().addEventListener('wheel', onWheelScroll(layer))
}

async function focus ({ dom, zoomBehavior }, { x, y, scale = 1, duration = 250 }) {
    const svgEl = dom.svg.node()

    dom.svg
        .transition()
        .duration(duration)
        .call(zoomBehavior.transform, d3ZoomIdentity.translate(svgEl.clientWidth / 2 - x * scale, svgEl.clientHeight / 2 - y * scale).scale(scale))

    return new Promise(resolve => setTimeout(resolve, duration + 100))
}

async function focusOnArea (diagram, { cx, cy, width, height, title_width }, duration) {
    const { dom } = diagram
    const svgEl = dom.svg.node()
    const scale = 0.9 / Math.max(Math.max(width, title_width ?? width) / svgEl.clientWidth, height / svgEl.clientHeight)

    console.log('focusOnArea', { cx, cy, width, height, title_width, scale })
    return focus(diagram, { x: cx, y: cy, scale, duration })
}

async function focusOnNode (diagram, node, scale, duration) {
    // node.fx = node.x
    // node.fy = node.y
    Simulations.stop(diagram)
    return focus(diagram, { x: node.x, y: node.y, scale, duration })
}

function restrictArea ({ zoomBehavior, transform, dom }, area) {
    if (!area) {
        const svgEl = dom.svg.node()
        const wiggleRoom = 0

        if (!transform) {
            transform = { x: 0, y: 0, k: 1 }
        }

        area = [
            [(-transform.x - wiggleRoom) / transform.k, (-transform.y - wiggleRoom) / transform.k],
            [
                (-transform.x + svgEl.clientWidth + (wiggleRoom)) / transform.k,
                (-transform.y + svgEl.clientHeight + (wiggleRoom)) / transform.k,
            ],
        ]

    }
    return zoomBehavior.translateExtent(area)
}

export const Zoom = {
    increment,
    decrement,
    restore,
    applySettings,
    clear,
    init,
    focusOnArea,
    focusOnNode,
    restrictArea,
}
