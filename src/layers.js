'use strict'
import { findNode, getTextWidth, removeDuplicatedLinks } from './utils.js'
import { Data } from './data.js'
import { Graphics } from './graphics.js'
import { Grouping } from './grouping.js'
import { Layout } from './layout.js'
import { Loading } from './ui/loading.js'
import { Panels } from './panels.js'
import { Simulations } from './simulations/simulations.js'
import { Zoom } from './zoom.js'
import { easeLinear as d3EaseLinear } from 'd3-ease'

const layerKeys = [
    'nodes',
    'groups',
    'edges',
    'graphics',
    'simulations',
    'autocompleteItems',
    'focusedGroup',
    'transform',
    'zoomBehavior',
]

const layerDomKeys = ['svg', 'groupsContainer', 'layerContainer']

const DrillDown = {
    apiUrl: 'api/diagramlayer2.json',
    async device (diagram, node) {
        let dataPromise = Data.fetch(`${this.apiUrl}?device=${node.name}`).then(data => ({
            ...data,
            devices: [structuredClone(node), ...data.links.map(link => ({
                name: link.target,
            }))],
        }))

        const targetZoom = Math.max(1.5, diagram.transform.k)
        await Zoom.focusOnNode(diagram, node, targetZoom, 250)

        const layer = await push(node.name, diagram, dataPromise)

        await dataPromise.then(data => {
            const newNode = findNode(layer, node.name)
            const radius = Math.max(diagram.dom.svg.node().clientHeight, diagram.dom.svg.node().clientWidth) + 100
            const separation = ((360 / data.links.length) * Math.PI) / 180

            newNode.x = layer.dom.svg.node().clientWidth / 2
            newNode.y = layer.dom.svg.node().clientHeight / 2
            Zoom.focusOnNode(diagram, newNode, targetZoom, 0)

            data.links.forEach((link, i) => {
                link.source = newNode
                link.target.x = newNode.x + (Math.cos(separation * i) * radius)
                link.target.y = newNode.y + (Math.sin(separation * i) * radius)
            })

            Graphics.update(layer)

            Zoom.restrictArea(layer)
            layer.zoomBehavior.scaleExtent([targetZoom, diagram.settings.maxZoomIn])
        })

        return layer
    },
    async subnet (diagram, node) {
        let dataPromise = Data.fetch(`${this.apiUrl}?subnet=${node.subnet}`).then(data => ({
            ...data,
            devices: data.devices.concat(data.links.reduce((missing, { source, target }) => {
                if (!data.devices.find(({ name }) => source === name)) {
                    missing.push({ name: source, external: true })
                } else if (!data.devices.find(({ name }) => target === name)) {
                    missing.push({ name: target, external: true })
                }
                return missing
            }, [])),
        }))

        await Zoom.focusOnNode(diagram, node, Math.max(1.5, diagram.transform.k), 250)

        const layer = await push(node.name, diagram, dataPromise, {
            delay: 0,
            fadeDuration: 500,
        })

        Simulations.init(diagram)
        await dataPromise.then(data => {
            const nodes = data.devices.filter(device => !device.external)
            const group = Grouping.fromNodes(diagram, nodes)
            const radius = Math.max(diagram.dom.svg.node().clientHeight, diagram.dom.svg.node().clientWidth) + 100
            const externalDevices = data.devices.filter(n => n.external)
            const separation = Math.min(((360 / externalDevices.length) * Math.PI / 180), 0.5)

            externalDevices.forEach((node, i) => {
                const external = findNode(layer, node.name)
                const svg = diagram.dom.svg.node()

                external.x = external.fx = group.cx + (Math.cos(separation * i) * radius) + svg.clientWidth
                external.y = external.fy = group.cy + (Math.sin(separation * i) * radius) + svg.clientHeight
            })
            Graphics.update(layer)

            // this waits until the simulation positions the nodes
            return new Promise(resolve => {
                setTimeout(async () => {
                    Grouping.polygonGenerator(diagram, group, nodes)
                    await Zoom.focusOnArea(diagram, group)

                    Zoom.restrictArea(layer)
                    layer.zoomBehavior.scaleExtent([layer.transform.k, diagram.settings.maxZoomIn])

                    resolve()
                }, 500)
            })
        })

        return layer
    },
    async do (diagram, node) {
        let layer

        if (node.isCloud) {
            layer = await this.subnet(diagram, node) //--SUSPENDED
            // return
        } else {
            layer = await this.device(diagram, node)
        }

        layer.processing = false
    },
}

function init (diagram) {
    const layers = diagram.layers = []

    layerKeys.forEach(key => {
        Object.defineProperty(diagram, key, {
            get () {
                return layers[0]?.[key]
            },
            set (val) {
                if (layers[0]) {
                    layers[0][key] = val
                }
            },
            configurable: true,
        })
    })

    layerDomKeys.forEach(key => {
        Object.defineProperty(diagram.dom, key, {
            get () {
                return layers[0]?.dom[key]
            },
            set (val) {
                if (layers[0]) {
                    layers[0].dom[key] = val
                }
            },
            configurable: true,
        })
    })

    Object.defineProperty(diagram, 'currentLayer', {
        get () {
            return layers[0]
        },
        configurable: true,
    })
}

async function toggle (layer, show, duration = 1000) {
    Object.values(layer.dom).forEach(el => {
        el.transition().duration(duration).ease(d3EaseLinear).style('opacity', show ? 1 : 0)
    })
    return new Promise(resolve => setTimeout(resolve, duration))
}

async function remove (layer) {
    if (layer.processing) return
    layer.processing = true
    layer.diagram.layers.splice(layer.diagram.layers.findIndex(l => layer === l), 1)
    await toggle(layer, false, 0)
    Object.values(layer.dom).forEach(el => el.remove())
}

async function push (id, diagram, data, { delay, fadeDuration } = { delay: 0, fadeDuration: 1000 }) {
    const layer = {
        id,
        diagram,
        dom: {},
        graphics: {},
        autocompleteItems: [],
        focusedGroup: -1,
        settings: diagram.settings,
        processing: true,
    }
    const first = !(diagram.layers && diagram.layers.length > 0)

    if (first) {
        init(diagram)
    }

    diagram.layers.unshift(layer)

    layer.dom.svg = diagram.dom.visContainer.append('svg')
        .style('width', '100%').style('height', '100%')

    if (!first) {
        const visContainer = diagram.dom.visContainer.node()

        layer.dom.svg
            .style('width', visContainer.clientWidth - 60)
            .style('height', visContainer.clientHeight - 60)
            .style('position', 'absolute')
            .style('background', 'transparent')
            .style('left', 40)
            .style('top', 30)
            .style('z-index', diagram.layers.length + 1)
            .style('opacity', 0)

        Grouping.box(diagram, layer.dom.svg)
            .attr('x', 5)
            .attr('y', 5)
            .style('width', 'calc(100% - 10px)')
            .style('height', 'calc(100% - 10px)')
            .attr('fill', '#eee')

        layer.dom.closeButton = diagram.dom.visContainer.append('img')
            .attr('src', 'assets/img/close.png')
            .attr('class', 'clickable')
            .style('height', '30px')
            .style('width', '30px')
            .style('position', 'absolute')
            .style('z-index', 999)
            .style('top', '25px')
            .style('cursor', 'pointer')
            .style('left', visContainer.clientWidth - 60 + 'px')

        layer.dom.closeButton.on('click', () => {
            remove(layer)
        })
    }
    layer.dom.layerContainer = layer.dom.svg.append('g').attr('class', 'container')
    Zoom.init(diagram, layer)

    // then we show the loading spinner in case data fetching takes a while
    Loading.start(diagram)

    if (!first) {
        setTimeout(() => {
            toggle(layer, true, fadeDuration)
        }, delay)
    }

    const graph = await data

    if (first) {
        diagram.data = {
            devices: graph.devices,
            edges: (removeDuplicatedLinks(graph.links) ?? []),
            subnets: graph.subnets,
            groups: graph.groups?.map(name => ({
                id: name,
                name: name.split('\\').pop(),
                title_width: getTextWidth(name),
                parent:  name.split('\\').slice(0, -1).join('\\'),
                hasChildGroup: graph.groups?.some(n => n.startsWith(name + '\\')),
            })) || [],
        }
        diagram.data.devices.forEach(device => {
            device.id = String(device.DevNum)
            device.group = graph.groups[device.group]
        })
        diagram.data.subnets.forEach(subnet => {
            subnet.id = subnet.name
        })
    }
    // then we wait for and parse the data
    Data.process(diagram, layer, graph, first)
    layer.dom.groupsContainer = layer.dom.layerContainer.append('g').attr('class', 'groups')
    // then we set the graphics
    Graphics.create(diagram, layer)

    if (!first) {
        Grouping.box(diagram, layer.dom.svg)
            .attr('x', 5)
            .attr('y', 5)
            .style('width', 'calc(100% - 10px)')
            .style('height', 'calc(100% - 10px)')
            .attr('fill', 'none')
    }
    if (first) {
        Panels.init(diagram)
    }
    Loading.finish(diagram)

    return layer
}

function undoInit (diagram) {
    layerKeys.forEach(key => {
        delete diagram[key]
    })
    layerDomKeys.forEach(key => {
        delete diagram.dom[key]
    })
    delete diagram.currentLayer
}

async function refreshLayer (diagram) {
    if (!diagram.layers || diagram.layers.length === 0) return
    await remove(diagram.layers[0])
    undoInit(diagram)
    document.querySelector('.setting-modal-container').remove()

    const layer = await push('main', diagram, Data.fetch('api/diagramlayer3.json'))
    layer.processing = false
    Simulations.init(diagram, layer)
    Grouping.init(diagram, layer)
    Layout.restore(diagram, layer)
    Zoom.restore(diagram, layer)
}

async function push_subnets (source, target, diagram, subnets_data) {
    const layer = {
        id: `subnets-${source}:${target}`,
        diagram,
        dom: {},
        graphics: {},
        autocompleteItems: [],
        focusedGroup: -1,
        settings: diagram.settings,
        processing: true,
    }

    diagram.layers.unshift(layer)
    layer.dom.svg = diagram.dom.visContainer.append('svg')
        .style('width', '100%').style('height', '100%')

    const visContainer = diagram.dom.visContainer.node()

    layer.dom.svg
        .style('width', visContainer.clientWidth - 60)
        .style('height', visContainer.clientHeight - 60)
        .style('position', 'absolute')
        .style('background', 'transparent')
        .style('left', 40)
        .style('top', 30)
        .style('z-index', diagram.layers.length + 1)
    // .style("opacity", 0)

    Grouping.box(diagram, layer.dom.svg)
        .attr('x', 5)
        .attr('y', 5)
        .style('width', 'calc(100% - 10px)')
        .style('height', 'calc(100% - 10px)')
        .attr('fill', '#eee')

    layer.dom.closeButton = diagram.dom.visContainer
        .append('img')
        .attr('src', 'assets/img/close.png')
        .attr('class', 'clickable')
        .style('height', '30px')
        .style('width', '30px')
        .style('position', 'absolute')
        .style('z-index', 999)
        .style('top', '25px')
        .style('cursor', 'pointer')
        .style('left', visContainer.clientWidth - 60 + 'px')

    layer.dom.closeButton.on('click', function () {
        remove(layer)
    })

    layer.dom.layerContainer = layer.dom.svg.append('g')
    Zoom.init(diagram, layer)

    // then we show the loading spinner in case data fetching takes a while
    Loading.start(diagram)

    layer.nodes = subnets_data.nodes
    layer.edges = subnets_data.edges
    layer.groups = []
    // then we set the graphics
    Graphics.create(diagram, layer)
    layer.dom.groupsContainer = layer.dom.layerContainer.append('g').attr('class', 'groups')
    Grouping.box(diagram, layer.dom.svg)
        .attr('x', 5)
        .attr('y', 5)
        .style('width', 'calc(100% - 10px)')
        .style('height', 'calc(100% - 10px)')
        .attr('fill', 'none')

    Loading.finish(diagram)

    return layer
}

export const Layers = {
    push,
    refreshLayer,
    push_subnets,
    drillDown: DrillDown,
}
