'use strict'
import { haveIntersection, inInteractMode } from '../utils.js'
import { Grouping } from '../grouping.js'
import { Groups } from './groups.js'
import { Layout } from '../layout.js'
import { Nodes } from './nodes.js'
import { drag as d3Drag } from 'd3-drag'

function init (diagram) {
    const layer = diagram.layers[0]

    layer.simulations = {
        nodes: Nodes.create(diagram, layer),
    }
    if (layer.groups && layer.groups.length > 0) {
        layer.simulations.groups = Groups.create(diagram, layer)
    }
}

function teardown ({ simulations }) {
    Object.keys(simulations).forEach(key => {
        simulations[key].stop()
        delete simulations[key]
    })
}

function init_trunked (diagram) {
    const layer = diagram.layers[0]

    layer.simulations = {
        nodes: Nodes.create_trunked(diagram, layer),
    }
    if (layer.groups && layer.groups.length > 0)
        layer.simulations.groups = Groups.create(diagram, layer)
}

function drag (diagram, layer) {
    let bounds
    let fixedGroups = []

    function dragstarted (event, d) {
        const { simulations, settings, focusedGroup, groups } = diagram
        if (inInteractMode(event)) return null

        if (!event.active) {
            simulations.nodes.alphaTarget(0.7).restart()
            if (settings.grouping && simulations.groups) {
                simulations.groups.alphaTarget(0.7).restart()
            }
        }

        d.fx = d.x
        d.fy = d.y

        if (focusedGroup > -1) {
            groups.find(g => g.id === focusedGroup).locked = true
            bounds = groups.find(g => g.id === focusedGroup)
            bounds = {
                x: [bounds.x + settings.groupPadding, bounds.x + bounds.width - settings.groupPadding],
                y: [bounds.y + settings.groupPadding, bounds.y + bounds.height - settings.groupPadding],
            }
        } else {
            bounds = null
        }

        fixedGroups = Grouping.getFixed(diagram, d.group)
    }

    function dragged (event, d) {
        if (inInteractMode(event)) return null
        if (!bounds || (event.x > bounds.x[0] && event.x < bounds.x[1])) {
            d.fx = event.x
        }
        if (!bounds || (event.y > bounds.y[0] && event.y < bounds.y[1])) {
            d.fy = event.y
        }
    }

    function dragended (event, d) {
        if (inInteractMode(event)) return null
        const { groups, simulations, settings } = diagram
        const group = groups ? groups.find(g => g.id === d.group) : null

        if (!event.active) {
            if (simulations.groups) {
                simulations.groups.alphaTarget(0)
            }
            simulations.nodes.alphaTarget(0)
        }

        if (groups) {
            Grouping.update(diagram, layer)
        }

        if (settings.floatMode < 2 || fixedGroups.some(fg => haveIntersection(diagram, fg, group))) {
            d.fx = null
            d.fy = null
        }
        Layout.save(diagram)
    }

    return d3Drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
}

function stop ({ simulations }) {
    if (simulations) {
        Object.values(simulations).forEach(simulation => simulation.stop())
    }
}

export const Simulations = {
    init,
    teardown,
    init_trunked,
    drag,
    stop,
}
