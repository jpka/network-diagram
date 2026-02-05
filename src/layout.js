'use strict'
import { debounce, parseJSON } from './utils.js'
import { Store } from './store.js'

const storageKey = 'layout'

function save (diagram) {
    const { nodes, groups, currentLayer } = diagram
    const newLayout = JSON.stringify({ nodes, groups })

    if (diagram.layout[currentLayer.id] !== newLayout) {
        diagram.layout[currentLayer.id] = newLayout
        Store.set(diagram, storageKey, JSON.stringify(diagram.layout))
    }
}

function get (diagram, layer) {
    const { currentLayer } = diagram

    diagram.layout = Store.getParsed(diagram, storageKey) || {}

    return parseJSON(diagram.layout[layer?.id ?? currentLayer.id])
}

function restore (diagram) {
    const { nodes, groups } = diagram
    const layout = get(diagram)

    if (!layout) return

    // check stored layout nodes and current nodes
    if (layout.nodes) {
        layout.nodes.forEach(storedNode => {
            nodes.forEach(node => {
                // and for each match restore their fixed positions
                if (storedNode.name === node.name) {
                    node.fx = storedNode.fx
                    node.fy = storedNode.fy
                }
            })
        })
    }

    // check stored layout groups and current groups
    if (layout.groups) {
        layout.groups.forEach(storedGroup => {
            groups.forEach(group => {
                // and for each match restore their fixed positions
                if (storedGroup.name === group.name) {
                    group.fx = storedGroup.fx
                    group.fy = storedGroup.fy
                }
            })
        })
    }
}

function clear (diagram) {
    Store.remove(diagram, storageKey)
}

export const Layout = {
    save: debounce(save, 1000),
    restore,
    clear,
}
