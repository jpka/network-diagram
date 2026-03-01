'use strict'
import { getSummarizedSubnets, getTrunkedSubnets, inInteractMode, throttle } from './utils.js'
import { Data } from './data.js'
import { Grouping } from './grouping.js'
import { Layers } from './layers.js'
import { Panels } from './panels.js'
import { Simulations } from './simulations/simulations.js'
import { Zoom } from './zoom.js'
import { select as d3Select } from 'd3-selection'

const timeoutRefresh = 300000
let timer = null
let soundAlert = false

function update ({ focusedGroup, groups, graphics }) {
    if (groups && focusedGroup > -1) {
        const group = groups.find(g => g.id === focusedGroup)
        group.nodes.forEach(d => {
            if (d.x < group.bounds.x[0]) {
                d.x = group.bounds.x[0]
            } else if (d.x > group.bounds.x[1]) {
                d.x = group.bounds.x[1]
            }
            if (d.y < group.bounds.y[0]) {
                d.y = group.bounds.y[0]
            } else if (d.y > group.bounds.y[1]) {
                d.y = group.bounds.y[1]
            }
        })
    }

    graphics.links
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)
    graphics.nodes.attr('transform', d => `translate(${d.x}, ${d.y})`)

    if (graphics.tempLinks && graphics.tempNodes) {
        graphics.tempLinks
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y)
        graphics.tempNodes.attr('transform', d => `translate(${d.x}, ${d.y})`)
    }

    if (graphics.warningElements) {
        graphics.warningElements
            .attr('x', d => (d.source.x + d.target.x) / 2 - 32 || 0)
            .attr('y', d => (d.source.y + d.target.y) / 2 - 40 || 0)
    }
}

function create (diagram, layer) {
    const graphics = diagram.graphics = {}
    const { dom, edges, nodes, settings } = diagram

    /**
     * @function showTooltipAt
     * @param {string} target=('target'|'coords')
     * @param {Event} event
     * @returns void
     */
    const showTooltipAt = throttle((target, event) => {
        const containerOffset = dom.container.node().getBoundingClientRect()
        let left = -containerOffset.left
        let top = 0
        if (target === 'target') {
            const pos = event.target.getBoundingClientRect()
            left += pos.left + pos.width
            top += pos.top
        }
        if (target === 'coords') {
            left += event.pageX + 10
            top += event.pageY
        }
        top += settings.toolbar ? -10 : 10
        dom.tooltipDiv.style('left', `${left}px`).style('top', `${top}px`).style('z-index', 9999)
    }, 50, { trailing: false })

    const showAllLinkstoNode = throttle(d => {
        graphics.links.filter(link => {
            return !(link.source.name === d.name || link.target.name === d.name)
        }).attr('opacity', 0.1)

        const focusedGroupID = diagram.focusedGroupID
        if (focusedGroupID > -1) {
            graphics.links.filter(link => {
                return link.source.group !== focusedGroupID && link.target.group !== focusedGroupID
                    && diagram.data.groups.find(g => g.id === link.source.group)?.parent !== focusedGroupID
                    && diagram.data.groups.find(g => g.id === link.target.group)?.parent !== focusedGroupID
            }).attr('opacity', 0)
        }
    })

    const clearAllLinkstoNode = throttle(() => {
        graphics.links.attr('opacity', 1)
        const focusedGroupID = diagram.focusedGroupID
        if (focusedGroupID > -1) {
            graphics.links.filter(link => link.source.group !== focusedGroupID && link.target.group !== focusedGroupID)
                .attr('opacity', 0)
            //
            // if (FOCUSED_GROUP_ID > -1) {
            //   graphics.links.filter(link => link.source.group !== FOCUSED_GROUP_ID && link.target.group !== FOCUSED_GROUP_ID)
            //     .attr("opacity", 0)
            // }
        }
    })

    const setFilterForHoveredItem = throttle(d => {
        graphics.links.filter(link => link.index !== d.index)
            .attr('opacity', 0.1)
        const focusedGroupID = diagram.focusedGroupID
        if (focusedGroupID > -1) {
            graphics.links.filter(link => {
                return link.source.group !== focusedGroupID && link.target.group !== focusedGroupID
                    && diagram.data.groups.find(g => g.id === link.source.group)?.parent !== focusedGroupID
                    && diagram.data.groups.find(g => g.id === link.target.group)?.parent !== focusedGroupID
            }).attr('opacity', 0)
        }
    })

    const clearFilterForHoveredItem = throttle(() => {
        graphics.links.attr('opacity', 1)

        const focusedGroupID = diagram.focusedGroupID
        if (focusedGroupID > -1) {
            graphics.links.filter(link => {
                return link.source.group !== focusedGroupID && link.target.group !== focusedGroupID
                    && diagram.data.groups.find(g => g.id === link.source.group)?.parent !== focusedGroupID
                    && diagram.data.groups.find(g => g.id === link.target.group)?.parent !== focusedGroupID
            }).attr('opacity', 0)
        }
    })

    //controls all link drawing and formatting
    graphics.links = layer.dom.layerContainer.selectAll('line')
        .data(edges)
        .enter().append('line')
        .attr('stroke', d => {
            return Graphics.getFillColor(d.status, 'black')
        })
        .attr('stroke-width', d => {
            return Math.min(d.width, 30)
        })
        .on('mouseover', (event, d) => {
            const focusedGroupID = diagram.focusedGroupID

            if (focusedGroupID > -1 && d.source.group !== focusedGroupID) return

            if (graphics.tempGroupExisted) return
            setFilterForHoveredItem(d)
            if (d.isSummarized || d.isTrunked) {
                dom.tooltipDiv.transition()
                    .duration(200)
                    .style('opacity', 1)
                    .style('display', 'block')

                const preTip = (d.status === 'offline') ? 'Undetermined status\n\n' : ''
                dom.tooltipInner.html(`${preTip}${d.totalSubnets} Aggregated ${d.isSummarized ? 'Subnets' : 'Networks'}`)
                showTooltipAt('coords', event)
                return
            }
            if (d.QoS || !d.isStaticWan) {
                dom.tooltipDiv.transition()
                    .duration(200)
                    .style('opacity', 1)
                    .style('display', 'block')

                const parts = [d.intDescription, d.ipAddress, (d.mask ?? d.target.mask), Data.downScaleBandwidth(d.bandwidth)]
                if (d.QoS) {
                    parts.push(d.QoS)
                }
                const preTip = (d.status === 'offline') ? 'Undetermined status\n\n' : ''
                dom.tooltipInner.html(preTip + parts.join('<br>'))
                showTooltipAt('coords', event)
            }
        })
        .on('mouseout', () => {
            clearFilterForHoveredItem()
            dom.tooltipDiv.transition()
                .duration(200)
                .style('opacity', 0)
                .style('display', 'none')
        })
        .on('click', async (event, d) => {
            //only clickable if in interactive mode
            if (inInteractMode(event)) {
                if (d.isSummarized) {
                    const subnets_data = await getSummarizedSubnets(d.source, diagram.data)
                    const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
                    Simulations.init(diagram, layer)
                    Graphics.update(layer)
                    const group = Grouping.fromNodes(diagram, subnets_data.nodes)
                    setTimeout(async () => {
                        Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
                        await Zoom.focusOnArea(diagram, group)
                        // Zoom.restrictArea(layer)
                        // layer.zoomBehavior.scaleExtent([layer.transform.k, diagram.settings.maxZoomIn])
                    }, 500)
                    layer.processing = false
                } else if (d.isTrunked) {
                    const subnets_data = await getTrunkedSubnets(d.source, d.target, diagram.data)
                    const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
                    Simulations.init_trunked(diagram, layer)
                    Graphics.update(layer)
                    const group = Grouping.fromNodes(diagram, subnets_data.nodes)
                    setTimeout(async () => {
                        Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
                        await Zoom.focusOnArea(diagram, group)
                    }, 500)

                    layer.processing = false
                } else {
                    window.location.assign(d.url)
                }
            }
        })
        .on('dblclick', async (event, d) => {
            if (d.isSummarized) {
                const subnets_data = await getSummarizedSubnets(d.source, diagram.data)
                const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
                Simulations.init(diagram, layer)
                Graphics.update(layer)
                const group = Grouping.fromNodes(diagram, subnets_data.nodes)
                setTimeout(async () => {
                    Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
                    await Zoom.focusOnArea(diagram, group)
                    // Zoom.restrictArea(layer)
                    // layer.zoomBehavior.scaleExtent([layer.transform.k, diagram.settings.maxZoomIn])
                }, 500)
                layer.processing = false
            } else if (d.isTrunked) {
                const subnets_data = await getTrunkedSubnets(d.source, d.target, diagram.data)
                const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
                Simulations.init_trunked(diagram, layer)
                Graphics.update(layer)
                const group = Grouping.fromNodes(diagram, subnets_data.nodes)
                setTimeout(async () => {
                    Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
                    await Zoom.focusOnArea(diagram, group)
                }, 500)

                layer.processing = false
            } else {
                window.location.assign(d.url)
            }
        })

    // controls all node drawing and formatting
    graphics.nodes = layer.dom.layerContainer.selectAll('.node')
        .data(nodes)
        .enter().append('g')
        .on('mouseover', (event, d) => {
            showAllLinkstoNode(d)
            if (d.isSummarized) {
                dom.tooltipDiv.transition()
                    .duration(200)
                    .style('opacity', 1)
                    .style('display', 'block')
                dom.tooltipInner.html(`${d.totalSubnets} Aggregated Subnets`)
                showTooltipAt('target', event)
                return
            }
            // only show tooltips for the current layer
            const parts = []

            dom.tooltipDiv.transition()
                .duration(200)
                .style('opacity', 1)
                .style('display', 'block')

            if (d.isUnmanaged) {
                parts.push(d.name)
            } else if (d.isCloud) {
                parts.push(`Subnet: ${d.subnet}`, `Mask: ${d.mask}`)
            } else {
                if (d.manufacturer || d.model || d.softwareOS) {
                    parts.push(d.ipAddress, d.manufacturer, d.model, d.softwareOS, d.location)
                } else {
                    parts.push('n/a')
                }
            }
            dom.tooltipInner.html(parts.join('<br>'))
            showTooltipAt('target', event)
        })
        .on('mouseout', function (event, d) {
            clearAllLinkstoNode(d)
            dom.tooltipDiv.transition()
                .duration(200)
                .style('opacity', 0)
                .style('display', 'none')

            if (d.isCloud) {
                d3Select(this).select('circle').transition().attr('r', 0)
            }
        })
        .on('click', async (event, d) => {
            if (inInteractMode(event)) {
                if (d.isSummarized) {
                    const subnets_data = await getSummarizedSubnets(d.source, diagram.data)
                    const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
                    Simulations.init(diagram, layer)
                    Graphics.update(layer)
                    const group = Grouping.fromNodes(diagram, subnets_data.nodes)
                    setTimeout(async () => {
                        Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
                        await Zoom.focusOnArea(diagram, group)
                    }, 500)

                    layer.processing = false
                } else {
                    window.location.assign(d.url)
                }
            }
        })
        .on('dblclick', async (event, d) => {
            if (d.isSummarized) {
                const subnets_data = await getSummarizedSubnets(d.source, diagram.data)
                const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
                Simulations.init(diagram, layer)
                Graphics.update(layer)
                const group = Grouping.fromNodes(diagram, subnets_data.nodes)
                setTimeout(async () => {
                    Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
                    await Zoom.focusOnArea(diagram, group)
                }, 500)

                layer.processing = false
            // if not a summarized subnet, drill down to device or subnet connections
            } else {
                Layers.drillDown.do(diagram, d)
                // window.location.assign(d.url)
            }
        })
        .on('contextmenu', (event, d) => {
            if (!settings.customContextMenu) return
            event.preventDefault()

            const x = event.pageX // Cursor X position
            const y = event.pageY // Cursor Y position

            dom.tooltipDiv.transition()
                .duration(200)
                .style('opacity', 0)
                .style('display', 'none')

            // Create a custom menu
            const menu = document.createElement('div')
            menu.style.position = 'absolute'
            menu.style.top = `${y}px`
            menu.style.left = `${x}px`
            menu.style.zIndex = 1000
            menu.innerHTML = '<div>Deselect Node</div>'
            if (!d.isCloud) {
                // --SUSPENDED for cloud (subnets)
                menu.innerHTML = '<div>View Details</div>' + menu.innerHTML
            }

            document.querySelectorAll('.custom-context-menu')
                .forEach(el => el.remove())
            menu.className = 'custom-context-menu'

            menu.addEventListener('click', e => {
                if (e.target.innerText === 'View Details') {
                    Layers.drillDown.do(diagram, d)
                } else if (e.target.innerText === 'Deselect Node') {
                // if (e.target.innerText === 'Deselect Node') {
                    Panels.remove_node(diagram, d)
                }
                document.body.removeChild(menu)
            })
            menu.addEventListener('mouseover', () => {
                showAllLinkstoNode(d)
            })
            menu.addEventListener('mouseout', () => {
                clearAllLinkstoNode(d)
            })

            document.body.appendChild(menu)
            document.addEventListener('pointerdown', e => {
                if (menu.contains(e.target)) return
                if (menu) document.body.removeChild(menu)
            }, { once: true })
        })
        .call(Simulations.drag(diagram, layer))

    //circle for node
    graphics.nodes.append('circle')
        .attr('r', 40)
        .attr('fill', d => {
            return ['issues', 'offline'].includes(d.status) ? getFillColor(d.status, 'black') : 'transparent'
        })
        .attr('opacity', 0.6)

    //attach image to node
    graphics.nodes.append('image')
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
    graphics.nodes.append('text')
        .style('font-size', d => d.isCloud ? '13px' : '16px')
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
                    if (d.isSummarized) return `${d.totalSubnets} Subnets`
                    return 'Internet'
                }
                return d.subnet
            } else {
                return d.name
            }
        })

    refreshStatus(layer)
}

function getFillColor (status, color = 'transparent') {
    status = status?.toLowerCase()
    return ([
        { status: ['healthy', 'ok'], color: 'green' },
        { status: ['suppressed', 'warning'], color: 'yellow' },
        { status: ['degraded', 'issues'], color: 'red' },
        { status: ['commfailure', 'offline'], color: 'grey' },
        { status: ['down'], color: 'black' },
    ].find((e) => e.status.includes(status)) || { color }).color
}

function refreshStatus (layer) {
    const warningLines = []
    layer.edges.forEach(edge => {
        if (edge.status === 'down') {
            warningLines.push(edge)
        }
    })
    if (document.querySelector('.warning-elements')) {
        document.querySelector('.warning-elements').innerHTML = ''
    }

    if (!layer.dom.warningElements) {
        layer.dom.warningElements = layer.dom.layerContainer.append('g')
            .attr('class', 'warning-elements')
    }

    layer.dom.warningElements.selectAll('image')
        .data(warningLines)
        .exit().remove()

    layer.graphics.warningElements = layer.dom.warningElements.selectAll('image')
        .data(warningLines)
        .enter().append('image')
        .attr('href', 'assets/graphics/warning.png')
        .attr('height', 64)
        .attr('width', 64)
        .attr('x', d => (d.source.x + d.target.x) / 2 - 32 || 0)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 40 || 0)

    if (soundAlert && document.getElementById('sound_check').checked) {
        soundAlert = false
        const audio = new Audio('assets/sounds/down.mp3')
        audio.play()
    }

    layer.graphics.links.transition()
        .duration(500)
        .attr('stroke', d => {
            return getFillColor(d.status, 'black')
        })

    layer.graphics.nodes.selectAll('circle')
        .transition()
        .duration(500) // Optional: Add a transition for smooth updates
        .attr('r', 40)
        .attr('fill', d => {
            return ['issues', 'offline'].includes(d.status) ? getFillColor(d.status, 'black') : 'transparent'
        })
        .attr('opacity', 0.6)

    if (layer.graphics.tempNodes) {
        layer.graphics.tempNodes.selectAll('circle')
            .transition()
            .duration(500) // Optional: Add a transition for smooth updates
            .attr('r', 40)
            .attr('fill', d => {
                return ['issues', 'offline'].includes(d.status) ? getFillColor(d.status, 'black') : 'transparent'
            })
            .attr('opacity', 0.6)
    }
}

async function fetchStatus (diagram) {
    if (timer != null) {
        const data = await Data.fetch('api/diagramlayer3.json')

        // set news status values
        const nodes = data.devices.filter(dev => !dev.image?.includes('cloud.png'))
        const edges = data.links

        nodes.forEach(node => {
            if (node.status !== 'offline') return
            edges.forEach(link => {
                if (link.DevNum !== node.DevNum) return
                link.status = node.status
            })
        })

        soundAlert = false

        // push new values
        diagram.layers.forEach(layer => {
            nodes.forEach(node => {
                const item = layer.nodes.find(n => n.DevNum === node.DevNum)
                if (item) {
                    item.status = node.status
                }
            })

            edges.forEach(link => {
                const item = layer.edges.find(e => e.ipAddress === link.ipAddress)
                if (item && (item.status !== link.status)) {
                    item.status = link.status
                    if (item.status === 'down') {
                        soundAlert = true
                    }
                }
            })

            refreshStatus(layer)
        })
    }

    timer = setTimeout(() => fetchStatus(diagram), timeoutRefresh)
}

function getLinkWidth (w) {
    return [
        [10000000, 3],
        [100000000, 4],
        [1000000000, 5],
        [10000000000, 6],
        [25000000000, 7],
        [50000000000, 8],
        [100000000000, 9],
        [Infinity, 10],
    ].find(([limit]) => w <= limit)[1]
}

function teardown () {
    clearTimeout(timer)
    timer = null
}

export const Graphics = {
    update,
    create,
    fetchStatus,
    refreshStatus,
    getLinkWidth,
    getFillColor,
    teardown,
}
