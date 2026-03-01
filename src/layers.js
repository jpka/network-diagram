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
    apiUrl: 'api/diagram',
    async device (diagram, node) {
        const dataPromise = Data.fetch(`${this.apiUrl}/device/${node.name}.json`).then(data => {
            if (!data.devices.some(d => d.name === node.name)) {
                data.devices.unshift(structuredClone(node))
            }
            return data
        })
        const layer = await push(node.name, diagram, dataPromise, {
            delay: 0,
            fadeDuration: 500,
        })
        Simulations.init(diagram, layer)
        
        Graphics.update(layer)
        const group = Grouping.fromNodes(diagram, layer.nodes)
        
        return new Promise(resolve => {
            setTimeout(async () => {
                const newNode = findNode(layer, node.name)
                Grouping.polygonGenerator(diagram, group, layer.nodes)
                await Zoom.focusOnNode(diagram, newNode)
                await Zoom.focusOnArea(diagram, group)
                resolve(layer)
            }, 500)
        })
    },
    async subnet (diagram, node) {
        const url = `${this.apiUrl}/subnet/${node.id}.json`
        const dataPromise = Data.fetch(url)
        const layer = await push(node.name, diagram, dataPromise, {
            delay: 0,
            fadeDuration: 0,
        })
        Simulations.init(diagram, layer)
        
        Graphics.update(layer)
        const group = Grouping.fromNodes(diagram, layer.nodes)
        
        return new Promise(resolve => {
            setTimeout(async () => {
                Grouping.polygonGenerator(diagram, group, layer.nodes)
                await Zoom.focusOnArea(diagram, group)
                layer.interval = setInterval(() => fetchLayerStatus(layer, url), 15000)
                resolve(layer)
            }, 500)
        })
    },
    async do (diagram, node) {
        let layer

        if (node.isCloud) {
            layer = await this.subnet(diagram, node)
        } else {
            layer = await this.device(diagram, node)
        }

        layer.processing = false
    },
}

async function fetchLayerStatus(layer, url) {
    const data = await Data.fetch(url)

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

    // soundAlert = false
    
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
            // if (item.status === 'down') {
            //     soundAlert = true
            // }
        }
    })

    Graphics.refreshStatus(layer)
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

async function remove (layer, duration = 0) {
    if (layer.processing) return
    layer.processing = true
    clearInterval(layer.interval)
    layer.diagram.layers.splice(layer.diagram.layers.findIndex(l => layer === l), 1)
    await toggle(layer, false, duration)
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
