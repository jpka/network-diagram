'use strict'
import {
    forceCollide as d3ForceCollide,
    forceLink as d3ForceLink,
    forceManyBody as d3ForceManyBody,
    forceSimulation as d3ForceSimulation,
    forceX as d3ForceX,
    forceY as d3ForceY,
} from 'd3-force'
import { Forces } from './forces.js'
import { Graphics } from '../graphics.js'
import { scaleOrdinal as d3ScaleOrdinal } from 'd3-scale'

function create (diagram, layer) {
    const { settings } = diagram
    const { nodes, edges, groups } = layer

    return d3ForceSimulation()
        .nodes(nodes)
        .force('x', d3ForceX().strength(0.1))
        .force('y', d3ForceY().strength(0.1))
        .force('link', d3ForceLink(edges).id(d => d.name).strength(link => {
            // when not grouping, links should be stronger
            if (!settings.grouping || !groups || groups.length === 0) {
                return 1
                // when grouping, we differentiate between same and not same group links
            } else if (link.source.group === link.target.group) {
                return 0.1
            } else {
                return 0.009
            }
        }))
        .force('cluster', Forces.cluster(diagram))
        .force('subnetPull', Forces.subnetPull(diagram))
        .force('charge', d3ForceManyBody().strength(-3000))
        .alpha(1)
        .alphaTarget(0)
        .on('tick', () => {
            Graphics.update(layer)
        })
}

function create_trunked (diagram, layer) {
    // const { settings } = diagram
    // const { nodes, edges, groups } = layer
    const { nodes, edges } = layer

    const x = d3ScaleOrdinal().domain([0, 1, 2]).range([0, -500, 500])
    const y = d3ScaleOrdinal().domain([0, 1, 2]).range([0, 1, 1])

    return d3ForceSimulation()
        .nodes(nodes)
        .force('x', d3ForceX().strength(0.1).x(d => x(d.displayGroup)))
        .force('y', d3ForceY().strength(d => y(d.displayGroup)).y(0))
        .force('link', d3ForceLink(edges).id(d => d.name).strength(0.01).distance(450))
        .force('charge', d3ForceManyBody().strength(-300)) // Stronger repulsion between nodes
        .force('subnetPull', Forces.subnetPull(diagram))
        .force('collision', d3ForceCollide().radius(25)) // Prevent node collapse with collision radius
        .velocityDecay(0.5) // Slow down node movement
        .alphaDecay(0.02) // Stop simulation faster after stabilizing
        .alphaMin(0.01)
        .alpha(1)
        .on('tick', () => {
            Graphics.update(layer)
        })
}

export const Nodes = {
    create,
    create_trunked,
}
