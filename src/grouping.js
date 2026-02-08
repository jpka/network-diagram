'use strict'
import { forceManyBody as d3ForceManyBody, forceX as d3ForceX, forceY as d3ForceY } from 'd3-force'
import { haveIntersection, inInteractMode, isFixed, throttle } from './utils.js'
import { Data } from './data.js'
import { Graphics } from './graphics.js'
import { Layout } from './layout.js'
import { Panels } from './panels.js'
import { Store } from './store.js'
import { Zoom } from './zoom.js'
import { drag as d3Drag } from 'd3-drag'
import { polygonHull as d3PolygonHull } from 'd3-polygon'

function setup ({ settings, graphics, simulations }) {
    if (!graphics.groupRect) return
    if (settings.grouping) {
        graphics.groupRect.attr('display', 'block')
        graphics.groupCloseBtn.attr('display', 'block')
        graphics.groupTexts.attr('display', 'block')
        simulations.nodes
            .force('x', d3ForceX().strength(0.1))
            .force('y', d3ForceY().strength(0.1))
            .force('charge', d3ForceManyBody().strength(-3000))
    } else {
        graphics.groupRect.attr('display', 'none')
        graphics.groupCloseBtn.attr('display', 'none')
        graphics.groupTexts.attr('display', 'none')
        simulations.nodes
            .force('x', d3ForceX().strength(0.4))
            .force('y', d3ForceY().strength(0.4))
            .force('charge', d3ForceManyBody().strength(-5000))
        simulations.groups.stop()
    }
}

function box_temp ({ settings }, containers) {
    return containers.append('rect')
        .attr('class', 'group-rect')
        .attr('stroke', '#83bad6')
        .attr('stroke-width', settings.groupBorderWidth)
        .attr('rx', 15)
        .attr('fill', '#eee')
        .attr('opacity', 1)
}

function toggle (diagram) {
    const { settings, nodes, simulations, groups } = diagram
    if (!groups) return

    settings.grouping = !settings.grouping

    nodes.forEach(node => {
        const nodePx = node.px
        const nodePy = node.py
        node.px = node.x
        node.py = node.y
        if (nodePx != null) {
            node.x = nodePx
            node.y = nodePy
        }
    })

    const pAlpha = simulations.nodes.pAlpha
    const pGroupAlpha = simulations.groups.pAlpha
    simulations.nodes.pAlpha = simulations.nodes.alpha()
    simulations.groups.pAlpha = simulations.groups.alpha()

    if (pAlpha != null) {
        simulations.nodes.alpha(pAlpha)
        simulations.groups.alpha(pGroupAlpha)
    } else {
        simulations.nodes.alpha(1)
        simulations.groups.alpha(1)
    }

    setup(diagram)

    if (settings.grouping) {
        simulations.groups.alphaTarget(0).restart()
    }
    simulations.nodes.alphaTarget(0).restart()

    Store.set(diagram, 'grouping', settings.grouping.toString())
}

function polygonGenerator ({ settings }, group, nodes, childNodes = []) {
    if (!nodes.length) return null

    let coords = nodes.reduce((acc, d) => ({
        x: [Math.min(acc.x[0], d.x), Math.max(acc.x[1], d.x)],
        y: [Math.min(acc.y[0], d.y), Math.max(acc.y[1], d.y)],
    }), { x: [nodes[0].x, nodes[0].x], y: [nodes[0].y, nodes[0].y] })

    // group.bounds = _.cloneDeep(coords)
    group.bounds = structuredClone(coords)
    coords.x[0] -= settings.groupPadding
    coords.x[1] += settings.groupPadding
    coords.y[0] -= settings.groupPadding
    coords.y[1] += settings.groupPadding

    if (childNodes.length > 0) {
        childNodes.forEach(d => {
            coords.x[0] = Math.min(coords.x[0], d.x - settings.groupPadding * 2)
            coords.x[1] = Math.max(coords.x[1], d.x + settings.groupPadding * 2)
            coords.y[0] = Math.min(coords.y[0], d.y - settings.groupPadding * 2)
            coords.y[1] = Math.max(coords.y[1], d.y + settings.groupPadding * 2)
        })
    }

    Object.assign(group, {
        width: coords.x[1] - coords.x[0],
        height: coords.y[1] - coords.y[0],
    })

    let polygon = group.polygon = [
        [coords.x[0], coords.y[0]],
        [coords.x[1], coords.y[0]],
        [coords.x[1], coords.y[1]],
        [coords.x[0], coords.y[1]],
    ]

    group.x = coords.x[0]
    group.y = coords.y[0]
    group.cx = group.x + Math.max(group.width, group.title_width ?? group.width) / 2
    group.cy = group.y + group.height / 2

    return d3PolygonHull(polygon)
}

function update (diagram, layer) {
    const { settings, focusedGroup } = diagram
    const { groups, graphics } = layer

    if (!settings.grouping || !groups) return

    groups.forEach(group => {
        if (group.locked) return

        const groupId = group.id
        let points = group.nodes = graphics.nodes
            .filter(d => d.group === groupId)
            .data()
        let polygon

        if (group.hasChildGroup) {
            let childGroups = groups.filter(g => g.parent === groupId)
            let childPoints = graphics.nodes
                .filter(d => childGroups.some(cg => cg.id === d.group))
                .data()
            polygon = polygonGenerator(diagram, group, points, childPoints)
        } else {
            polygon = polygonGenerator(diagram, group, points)
        }

        if (!polygon) return

        if (focusedGroup === group.id) {
            graphics.groupCloseBtn
                .attr('x', group.x + Math.max(group.width, group.title_width ?? group.width) - 20)
                .attr('y', group.y - 10)
        }
        graphics.groupRect
            .filter(d => d === groupId)
            .attr('x', group.x)
            .attr('y', group.y)
            .attr('width', Math.max(group.width, group.title_width ?? group.width))
            .attr('height', group.height)
        graphics.groupTexts
            .filter(d => d === groupId)
            .attr('x', group.x + 20)
            .attr('y', group.y + 45)
            .attr('style', 'font-size: 36px; font-family: Arial, Helvetica, sans-serif')

        graphics.groupBorders
            .filter(d => d === groupId)
            .attr('x', group.x)
            .attr('y', group.y)
            .attr('width', Math.max(group.width, group.title_width ?? group.width))
            .attr('height', group.height)

        if (graphics.tempGroupRect) {
            graphics.tempGroupRect
                .filter(d => d === groupId)
                .attr('x', group.x)
                .attr('y', group.y)
                .attr('width', Math.max(group.width, group.title_width ?? group.width))
                .attr('height', group.height)

            graphics.tempGroupTexts
                .filter(d => d === groupId)
                .attr('x', group.x + 20)
                .attr('y', group.y + 45)
                .attr('style', 'font-size: 36px; font-family: Arial, Helvetica, sans-serif')
        }
    })
}

function focus (diagram, groupId) {
    unfocus(diagram)

    diagram.focusedGroup = groupId

    const group = diagram.groups.find(g => g.id === groupId)

    diagram.graphics.groupCloseBtn
        .attr('x', group.x + Math.max(group.width, group.title_width ?? group.width) - 20)
        .attr('y', group.y - 10)
        .attr('style', 'display: block')
        .on('click', () => {
            unfocus(diagram, { k: 0.25 })
        })

    if (diagram.focusedGroup > -1) {
        diagram.graphics.links
            .filter(link => (link.source.group !== diagram.focusedGroup) && (link.target.group !== diagram.focusedGroup))
            .attr('opacity', 0.9)
    }
    Zoom.focusOnArea(diagram, group)
}

function unfocus (diagram, targetZoom) {
    const { focusedGroup, groups, dom, zoomBehavior, graphics } = diagram

    if (focusedGroup < 0) return

    const group = groups.find(g => g.id === focusedGroup)

    if (targetZoom) {
        dom.svg.transition()
            .call(zoomBehavior.scaleTo, targetZoom.k)
    }

    graphics.groupCloseBtn.style("display", "none")
    group.locked = false
    diagram.focusedGroup = -1
}

function box ({ settings }, containers) {
    return containers.append('rect')
        .attr('class', 'group-rect')
        .attr('stroke', '#83bad6')
        .attr('stroke-width', settings.groupBorderWidth)
        .attr('rx', 15)
        .attr('fill', 'transparent')
        .attr('opacity', 1)
}

function getFixed (diagram, otherThan) {
    let ret = diagram.groups ?? []

    if (otherThan != null) {
        const childGroups = diagram.data.groups
            .filter(g => g.parent === otherThan)
            .map(g => g.id)
        const parentGroup = diagram.data.groups.find(g => g.id === otherThan)?.parent

        ret = ret.filter(g => [...childGroups, otherThan, parentGroup].indexOf(g.id) === -1)
    }
    ret = ret.filter(group => isFixed(diagram, group))

    return ret
}

function box_border ({ settings }, containers) {
    return containers.append('rect')
        .attr('class', 'group-rect')
        .attr('stroke', '#83bad6')
        .style('pointer-events', 'none')
        .attr('stroke-width', settings.groupBorderWidth)
        .attr('rx', 15)
        .attr('fill', 'transparent')
        .attr('opacity', 1)
}

function closeButton (diagram, containers) {
    return containers.append('image')
        .attr('href', 'assets/img/close.png')
        .attr('height', 30)
}

function init (diagram, layer) {
    let fixedGroups = []
    let dragStart = {}
    let { settings } = diagram
    let { groups, edges, nodes, graphics, dom, simulations } = layer

    layer.dom.tempElements = layer.dom.layerContainer.append('g')
        .attr('class', 'temp-elements')
        .style('pointer-events', 'none')

    if (!layer.dom.warningElements) {
        layer.dom.warningElements = layer.dom.layerContainer.append('g')
            .attr('class', 'warning-elements')
    }

    if (!groups || groups.length === 0) return

    const highlightGroup = throttle(group_id => {
        document.querySelector('.temp-elements').innerHTML = ''
        graphics.tempGroupExisted = true
        layer.dom.tempGroupsContainer = layer.dom.tempElements.append('g')
            .attr('class', 'temp-groups')

        graphics.tempGroupContainers = dom.tempGroupsContainer.selectAll('.temp-groups')
            .data(groups.filter(group => group.id === group_id || group.parent === group_id).map(({ id }) => id))
            .enter()

        graphics.tempWarnElements = dom.tempElements.append('g')
            .attr('class', 'warning-elements')

        graphics.tempGroupRect = box_temp(diagram, graphics.tempGroupContainers)
        graphics.tempGroupTexts = graphics.tempGroupContainers.append('text')
            .text(d => groups.find(g => g.id === d).name)
            .attr('class', 'temp-group-text')

        const filtered_edges = edges.filter(link => {
            return link.source.group === group_id
                || link.target.group === group_id
                || diagram.data.groups.find(g => g.id === link.source.group)?.parent === group_id
                || diagram.data.groups.find(g => g.id === link.target.group)?.parent === group_id
        })

        graphics.tempLinks = layer.dom.tempElements.selectAll('line')
            .data(filtered_edges)
            .enter()
            .append('line')
            .attr('stroke', d => {
                return Graphics.getFillColor(d.status, 'black')
            })
            .attr('stroke-width', d => Math.min(d.width, 30))

        const warningLines = []
        filtered_edges.forEach(edge => {
            if (edge.status === 'down') {
                warningLines.push(edge)
            }
        })
        graphics.tempWarns = graphics.tempWarnElements.selectAll('image')
            .data(warningLines)
            .enter().append('image')
            .attr('href', 'assets/graphics/warning.png')
            .attr('height', 64)
            .attr('width', 64)
            .attr('x', d => (d.source.x + d.target.x) / 2 - 32 || 0)
            .attr('y', d => (d.source.y + d.target.y) / 2 - 40 || 0)

        const filtered_nodes = nodes.filter(node => {
            if (node.group === group_id || diagram.data.groups.find(g => g.id === node.group)?.parent === group_id) {
                return true
            }
            return edges.some(edge => {
                if (edge.source === node || edge.target === node) {
                    return true
                }
                return edge.source.group === group_id || edge.target.group === group_id
            })
        })

        graphics.tempNodes = layer.dom.tempElements.selectAll('.node')
            .data(filtered_nodes)
            .enter()
            .append('g')

        graphics.tempNodes.append('circle')
            .attr('r', 40)
            .attr('fill', d => {
                return ['issues', 'offline'].includes(d.status) ? Graphics.getFillColor(d.status, 'black') : 'transparent'
            })
            .attr('opacity', 0.6)

        //attach image to node
        graphics.tempNodes.append('image')
            .attr('xlink:href', d => d.image)
            .attr('height', d => {
                const h = 60
                return d.isCloud ? (h * 1.5) : h
            })
            .attr('width', d => {
                const w = 60
                return d.isCloud ? (w * 1.5) : w
            })
            .attr('x', d => {
                const x = -30
                return d.isCloud ? (x * 1.5) : x
            })
            .attr('y', d => {
                const y = -30
                return d.isCloud ? (y * 1.5) : y
            })

        //controls the labels for each node
        graphics.tempNodes.append('text')
            .style('font-size', d => (d.isCloud ? '13px' : '16px'))
            .style('fill', 'black')
            .style('font-family', 'Arial, Helvetica, sans-serif')
            .attr('text-anchor', 'middle')
            .attr('dy', d => {
                const dy = 45
                return d.isCloud ? (dy * 0.1) : dy
            })
            .text(d => {
                if (d.isUnmanaged) {
                    return ''
                } else if (d.isCloud) {
                    if (Data.inPubInt(d.subnet) && Data.onlyHasOneDev(diagram, d.subnet)) {
                        return d.isSummarized ? `${d.totalSubnets} Subnets` : 'Internet'
                    }
                    return d.subnet
                } else {
                    return d.name
                }
            })

        Graphics.update(layer)
        update(diagram, layer)

        graphics.links
            .filter(link => !(link.source.group === group_id || link.target.group === group_id))
            .attr('opacity', 0.1)

        const focusedGroupID = diagram.focusedGroupID
        if (focusedGroupID > -1) {
            graphics.links.filter(link => {
                return link.source.group !== focusedGroupID
                    && link.target.group !== focusedGroupID
                    && diagram.data.groups.find(g => g.id === link.source.group)?.parent !== focusedGroupID
                    && diagram.data.groups.find(g => g.id === link.target.group)?.parent !== focusedGroupID
            }).attr('opacity', 0)
        }
    })

    const clearHighlightGroup = throttle(() => {
        document.querySelector('.temp-elements').innerHTML = ''
        graphics.tempGroupExisted = false
        graphics.tempLinks = null
        graphics.tempNodes = null
        graphics.tempWarns = null
        graphics.tempWarnElements = null
        graphics.tempGroupRect = null
        graphics.tempGroupTexts = null

        graphics.links.attr('opacity', 1)
        const focusedGroupID = diagram.focusedGroupID

        if (focusedGroupID > -1) {
            graphics.links.filter(link => {
                return link.source.group !== focusedGroupID
                    && link.target.group !== focusedGroupID
                    && diagram.data.groups.find(g => g.id === link.source.group)?.parent !== focusedGroupID
                    && diagram.data.groups.find(g => g.id === link.target.group)?.parent !== focusedGroupID
            }).attr('opacity', 0)
        }
    })

    graphics.groupContainers = dom.groupsContainer.selectAll('.group')
        .data(groups.sort((a, b) => a.parent - b.parent).map(({ id }) => id))
        .enter()
    // graphics.groupContainers = dom.groupsContainer.selectAll(".group")
    // .data(groups.filter(group => group.parent > -1)
    // .map(({ id }) => id))
    // .enter()
    graphics.groupRect = box(diagram, graphics.groupContainers)
        .call(d3Drag()
            .on('start', (event, p) => {
                if (inInteractMode(event) || layer.focusedGroup === p) {
                    return null
                }
                if (!event.active) {
                    simulations.nodes.alphaTarget(0.7).restart()
                    simulations.groups.alphaTarget(0.7).restart()
                }
                dragStart.x = event.x
                dragStart.y = event.y
                groups.find(g => g.id === p).sx = groups.find(g => g.id === p).x
                groups.find(g => g.id === p).sy = groups.find(g => g.id === p).y

                graphics.nodes.filter(d => {
                    if (d.group < 0) return false
                    return d.group === p || diagram.data.groups.find(g => g.id === d.group).parent === p
                }).each(d => {
                    d.fx = d.sx = d.x
                    d.fy = d.sy = d.y
                })
                fixedGroups = getFixed(diagram, p)
            })
            .on('drag', (event, p) => {
                if (inInteractMode(event) || layer.focusedGroup === p) {
                    return null
                }
                let fx = groups.find(g => g.id === p).sx - dragStart.x + event.x
                let fy = groups.find(g => g.id === p).sy - dragStart.y + event.y

                graphics.nodes.filter(d => {
                    if (d.group < 0) return false
                    return d.group === p || diagram.data.groups.find(g => g.id === d.group).parent === p
                }).each(d => {
                    d.fx = d.sx - dragStart.x + event.x
                    d.fy = d.sy - dragStart.y + event.y
                })

                groups.find(g => g.id === p).fx = fx
                groups.find(g => g.id === p).fy = fy
            })
            .on('end', (event, p) => {
                if (inInteractMode(event)) {
                    return null
                }
                let group = groups.find(g => g.id === p)

                if (!event.active) {
                    simulations.groups.alphaTarget(0)
                    simulations.nodes.alphaTarget(0)
                }

                update(diagram, layer)

                if (settings.floatMode < 2 || fixedGroups.some(fg => haveIntersection(diagram, fg, group))) {
                    group.fx = null
                    group.fy = null
                    graphics.nodes.filter(d => d.group === p).each(d => {
                        d.fx = null
                        d.fy = null
                    })
                    if (group.hasChildGroup) {
                        let childGroups = groups.filter(g => g.parent === p)
                        childGroups.forEach(cg => {
                            cg.fx = null
                            cg.fy = null
                        })
                        graphics.nodes.filter(d => childGroups.some(cg => cg.id === d.group))
                            .each(d => {
                                d.fx = null
                                d.fy = null
                            })
                    }
                }
                Layout.save(diagram)
            }))
        .on('contextmenu', (event, d) => {
            if (!settings.customContextMenu) return
            event.preventDefault()
            const x = event.pageX // Cursor X position
            const y = event.pageY // Cursor Y position
            diagram.dom.tooltipDiv.transition()
                .duration(200)
                .style('opacity', 0)
                .style('display', 'none')
            // Create a custom menu
            const menu = document.createElement('div')
            menu.style.position = 'absolute'
            menu.style.top = `${y}px`
            menu.style.left = `${x}px`
            menu.style.zIndex = 1000
            menu.innerHTML = '<div>View Details</div><div>Deselect Node</div>'

            document.querySelectorAll('.custom-context-menu')
                .forEach(el => el.remove())
            menu.className = 'custom-context-menu'

            menu.addEventListener('click', e => {
                event.stopPropagation()
                if (e.target.innerText === 'View Details') {
                    focus(diagram, d)
                } else if (e.target.innerText === 'Deselect Node') {
                    Panels.remove_group(diagram, d)
                }
                document.body.removeChild(menu)
            })

            menu.addEventListener('mouseover', () => {
                highlightGroup(d)
            })

            menu.addEventListener('mouseleave', () => {
                clearHighlightGroup()
            })

            document.body.appendChild(menu)
            document.addEventListener('pointerdown', e => {
                if (menu.contains(e.target)) return
                if (menu) document.body.removeChild(menu)
            }, { once: true })
        })
        .on('mouseover', (event, group_id) => {
            highlightGroup(group_id)
        })
        .on('mouseout', () => {
            clearHighlightGroup()
        })
        .on('dblclick', (event, d) => {
            focus(diagram, d)
        })
    graphics.groupTexts = graphics.groupContainers.append('text')
        .text(d => groups.find(g => g.id === d).name)
        .attr('class', 'group-text')
        .on('click', (event, d) => {
            if (event.shiftKey) {
                focus(diagram, d)
            }
        })
        .on('contextmenu', (event, d) => {
            if (!settings.customContextMenu) return
            event.preventDefault()
            const x = event.pageX // Cursor X position
            const y = event.pageY // Cursor Y position
            diagram.dom.tooltipDiv.transition()
                .duration(200)
                .style('opacity', 0)
                .style('display', 'none')
            // Create a custom menu
            const menu = document.createElement('div')
            menu.style.position = 'absolute'
            menu.style.top = `${y}px`
            menu.style.left = `${x}px`
            menu.style.zIndex = 1000
            menu.innerHTML = '<div>View Details</div><div>Deselect Node</div>'

            document.querySelectorAll('.custom-context-menu')
                .forEach(el => el.remove())
            menu.className = 'custom-context-menu'

            menu.addEventListener('click', e => {
                if (e.target.innerText === 'View Details') {
                    focus(diagram, d)
                } else if (e.target.innerText === 'Deselect Node') {
                    Panels.remove_group(diagram, d)
                }
                document.body.removeChild(menu)
            })

            menu.addEventListener('mouseover', () => {
                highlightGroup(d)
            })

            menu.addEventListener('mouseleave', () => {
                clearHighlightGroup()
            })

            document.body.appendChild(menu)
            document.addEventListener('pointerdown', e => {
                if (menu.contains(e.target)) return
                if (menu) document.body.removeChild(menu)
            }, { once: true })
        })
        .call(d3Drag()
            .on('start', (event, p) => {
                if (inInteractMode(event) || layer.focusedGroup === p) {
                    return null
                }
                if (!event.active) {
                    simulations.nodes.alphaTarget(0.7).restart()
                    simulations.groups.alphaTarget(0.7).restart()
                }
                dragStart.x = event.x
                dragStart.y = event.y
                groups.find(g => g.id === p).sx = groups.find(g => g.id === p).x
                groups.find(g => g.id === p).sy = groups.find(g => g.id === p).y

                graphics.nodes.filter(d => {
                    if (d.group < 0) return false
                    return d.group === p || diagram.data.groups.find(g => g.id === d.group).parent === p
                }).each(d => {
                    d.fx = d.sx = d.x
                    d.fy = d.sy = d.y
                })
                fixedGroups = getFixed(diagram, p)
            })
            .on('drag', (event, p) => {
                if (inInteractMode(event) || layer.focusedGroup === p) {
                    return null
                }
                let fx = groups.find(g => g.id === p).sx - dragStart.x + event.x
                let fy = groups.find(g => g.id === p).sy - dragStart.y + event.y

                graphics.nodes.filter(d => {
                    if (d.group < 0) return false
                    return d.group === p || diagram.data.groups.find(g => g.id === d.group).parent === p
                }).each(d => {
                    d.fx = d.sx - dragStart.x + event.x
                    d.fy = d.sy - dragStart.y + event.y
                })

                groups.find(g => g.id === p).fx = fx
                groups.find(g => g.id === p).fy = fy
            })
            .on('end', (event, p) => {
                if (inInteractMode(event)) return null
                let group = groups.find(g => g.id === p)

                if (!event.active) {
                    simulations.groups.alphaTarget(0)
                    simulations.nodes.alphaTarget(0)
                }

                update(diagram, layer)

                if (settings.floatMode < 2 || fixedGroups.some(fg => haveIntersection(diagram, fg, group))) {
                    group.fx = null
                    group.fy = null
                    graphics.nodes.filter(d => d.group === p).each(d => {
                        d.fx = null
                        d.fy = null
                    })
                    if (group.hasChildGroup) {
                        let childGroups = groups.filter(g => g.parent === p)
                        childGroups.forEach(cg => {
                            cg.fx = null
                            cg.fy = null
                        })
                        graphics.nodes.filter(d => childGroups.some(cg => cg.id === d.group))
                            .each(d => {
                                d.fx = null
                                d.fy = null
                            })
                    }
                }
                Layout.save(diagram)
            }))
        .on('mouseover', (event, group_id) => {
            highlightGroup(group_id)
        })
        .on('mouseout', () => {
            clearHighlightGroup()
        })
        .on('dblclick', (event, d) => {
            focus(diagram, d)
        })

    layer.dom.groupBordersContainer = layer.dom.layerContainer.append('g')
        .attr('class', 'group-borders')

    graphics.groupBorderContainers = dom.groupBordersContainer.selectAll('.group')
        .data(groups.sort((a, b) => a.parent - b.parent).map(({ id }) => id))
        .enter()
    graphics.groupBorders = box_border(diagram, graphics.groupBorderContainers)

    graphics.groupCloseBtn = closeButton(diagram, dom.groupBordersContainer)
        .attr('style', 'display: none')

    setup(diagram)
}

function fromNodes (diagram, nodes) {
    const group = {}

    polygonGenerator(diagram, group, nodes)

    return group
}

export const Grouping = {
    toggle,
    init,
    box,
    update,
    fromNodes,
    polygonGenerator,
    getFixed,
}
