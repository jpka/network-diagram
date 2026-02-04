'use strict'
import { forceSimulation as d3ForceSimulation, forceX as d3ForceX, forceY as d3ForceY } from 'd3-force'
import { Forces } from './forces.js'
import { Grouping } from '../grouping.js'

function create (diagram, layer) {
    const { groups } = layer

    groups.forEach(group => {
        let nodes = layer.graphics.nodes.filter(d => d.group === group.id)
        group.nodeCount = nodes.size()
        if (group.hasChildGroup) {
            let childGroups = groups.filter(g => g.parent === group.id)
            let childNodes = layer.graphics.nodes.filter(d => childGroups.some(cg => cg.id === d.group))
            group.nodeCount += childNodes.size()
        }
    })
    return d3ForceSimulation()
        .alpha(1)
        .alphaTarget(0)
        .force('x', d3ForceX(1000).strength(d => {
            const nodeCount = d.nodeCount || 1
            return 0.1 * diagram.currentWeight / nodeCount
        }))
        .force('y', d3ForceY(1000).strength(d => {
            const nodeCount = d.nodeCount || 1
            return 0.1 * diagram.currentWeight / nodeCount
        }))
        .force('collision', Forces.rectCollide(diagram))
        .nodes(groups.filter(group => group.parent < 0))
        .on('tick', () => {
            Grouping.update(diagram, layer)
        })
}

export const Groups = {
    create,
}
