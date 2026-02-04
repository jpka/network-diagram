'use strict'
import { quadtree as d3Quadtree } from 'd3-quadtree'
import { isFixed } from '../utils.js'

function cluster ({ settings, groups }) {
    const strength = 0.2
    let nodes

    function force (alpha) {
        if (!settings.grouping || !groups || groups.length === 0) return
        const l = alpha * strength
        for (const d of nodes) {
            const { cx, cy } = groups.find(g => g.id === d.group) || { cx: 0, cy: 0 }
            if (cx && cy) {
                d.vx -= (d.x - cx) * l
                d.vy -= (d.y - cy) * l
            }
        }
    }

    force.initialize = _ => nodes = _

    return force
}

function rectCollide (diagram) {
    function constant (_) {
        return function () { return _ }
    }

    let nodes
    let size = constant([0, 0])
    let iterations = 1
    const padding = 100

    function sizes (i) {
        const n = nodes[i]
        return [n.width, n.height]
    }

    function masses (i) {
        const s = sizes(i)
        return s[0] * s[1]
    }

    function force () {
        let node
        let size
        let mass
        let xi
        let yi
        let i = -1

        while (++i < iterations) {
            iterate()
        }

        function iterate () {
            var j = -1
            var tree = d3Quadtree(nodes, xCenter, yCenter).visitAfter(prepare)

            while (++j < nodes.length) {
                node = nodes[j]
                size = sizes(j)
                mass = masses(j)
                xi = xCenter(node)
                yi = yCenter(node)

                tree.visit(apply)
            }
        }

        function apply (quad, x0, y0, x1, y1) {
            const data = quad.data
            const xSize = ((size[0] + quad.size[0]) / 2) + padding
            const ySize = ((size[1] + quad.size[1]) / 2) + padding
            let strength = 1
            if (data) {
                if (data.index <= node.index) { return }

                let x = xi - xCenter(data)
                let y = yi - yCenter(data)
                const xd = Math.abs(x) - xSize
                const yd = Math.abs(y) - ySize

                if (xd < 0 && yd < 0) {
                    const l = Math.sqrt(x * x + y * y)
                    const m = masses(data.index) / (mass + masses(data.index))

                    if (Math.abs(xd) < Math.abs(yd)) {
                        let xDiff = (x *= xd / l * strength) * m
                        if (!isFixed(diagram, node)) {
                            node.nodes.forEach(n => {
                                n.x -= xDiff
                            })
                        }
                        if (!isFixed(diagram, data)) {
                            data.nodes.forEach(n => {
                                n.x += x * (1 - m)
                            })
                        }
                    } else {
                        let yDiff = (y *= yd / l * strength) * m
                        if (!isFixed(diagram, node)) {
                            node.nodes.forEach(n => {
                                n.y -= yDiff
                            })
                        }
                        if (!isFixed(diagram, data)) {
                            data.nodes.forEach(n => {
                                n.y += y * (1 - m)
                            })
                        }
                    }
                }
            }

            // let collide = x0 > xi + xSize || y0 > yi + ySize
            //     || x1 < xi - xSize || y1 < yi - ySize
            //
            // return collide
            return x0 > xi + xSize || y0 > yi + ySize
                || x1 < xi - xSize || y1 < yi - ySize
        }

        function prepare (quad) {
            if (quad.data) {
                quad.size = sizes(quad.data.index)
            } else {
                quad.size = [0, 0]
                var i = -1
                while (++i < 4) {
                    if (quad[i] && quad[i].size) {
                        quad.size[0] = Math.max(quad.size[0], quad[i].size[0])
                        quad.size[1] = Math.max(quad.size[1], quad[i].size[1])
                    }
                }
            }
        }
    }

    function xCenter (d) { return d.x + d.vx + sizes(d.index)[0] / 2 }

    function yCenter (d) { return d.y + d.vy + sizes(d.index)[1] / 2 }

    force.initialize = function (_) {
        nodes = _
    }

    force.size = function (_) {
        return (arguments.length
            ? (size = typeof _ === 'function' ? _ : constant(_), force)
            : size)
    }

    // force.strength = function (_) { fixme
    //     return (arguments.length ? (strength = +_, force) : strength)
    // }

    force.iterations = function (_) {
        return (arguments.length ? (iterations = +_, force) : iterations)
    }

    return force
}

export const Forces = {
    cluster,
    rectCollide,
}
