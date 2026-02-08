'use strict'

import { Zoom } from './zoom.js'

/**
 * @function debounce
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
export function debounce (func, wait) {
    let timeout = null

    return function (...args) {
        const later = () => {
            timeout = null
            func.apply(this, args)
        }

        clearTimeout(timeout)
        timeout = setTimeout(later, wait)
    }
}

/**
 * @function throttle
 * @param {Function} func
 * @param {number} wait
 * @return {Function}
 */
export function throttle (func, wait) {
    let timeout = null

    return function (...args) {
        if (timeout !== null) return
        func.apply(this, args)
        timeout = setTimeout(() => {
            timeout = null
        }, wait)
    }
}

/**
 * @function parseJSON
 * @param {*} value
 * @return {*|string}
 */
export function parseJSON (value) {
    if (!value || typeof value !== 'string') return value

    try {
        return JSON.parse(value)
    } catch (e) {
        console.error(e)
        return false
    }
}

export function registerDocumentEventListener ({ docEventListeners }, type, listener) {
    document.addEventListener(type, listener)
    docEventListeners.push([type, listener])
}

export function cleanEventListeners ({ docEventListeners }) {
    docEventListeners.forEach(([type, listener]) => document.removeEventListener(type, listener))
}

export function inInteractMode (event) {
    return !!(event.shiftKey || event.sourceEvent?.shiftKey)
}

export function haveIntersection ({ settings }, r1, r2) {
    if (!r1 || !r2) return false

    const { groupBorderWidth } = settings

    return !(r2.x - groupBorderWidth > r1.x + r1.width
        || r2.x + r2.width < r1.x - groupBorderWidth
        || r2.y - groupBorderWidth > r1.y + r1.height
        || r2.y + r2.height < r1.y - groupBorderWidth)
}

export function isFixed ({ focusedGroup }, node) {
    return node.fx != null || node.nodes && (node.nodes.some(n => n.fx != null) || focusedGroup === node.id)
}

export function removeDuplicatedLinks (arr) {
    const seen = new Set()
    return arr.filter(item => {
        const key = `${item.source}-${item.target}`
        if (seen.has(key)) {
            return false
        } else {
            seen.add(key)
            return true
        }
    })
}

export function getTextWidth (text, font = '36px Arial') {
    // Create a temporary span element
    let span = document.createElement('span')

    // Set the text content of the span
    span.textContent = text

    // Apply the font style to match the text you want to measure
    span.style.font = font

    // Make the span invisible but still able to measure width
    span.style.position = 'absolute'
    span.style.visibility = 'hidden'

    // Add the span to the body
    document.body.appendChild(span)

    // Get the width of the text
    let width = span.offsetWidth + 40

    // Remove the span after measurement
    document.body.removeChild(span)

    return width
}

export function isNodeVisible (node, config) {
    if (node.isCloud) {
        return config.subnets.has(node.id)
    }
    return config.devices.has(node.id)
}

export function generateEdgeKey (source, target) {
    return (source < target) ? `${source}:${target}` : `${target}:${source}`
}

export async function getSummarizedSubnets (source, data) {
    // const center_device = _.cloneDeep(source)
    const center_device = structuredClone(source)
    const connected_links = data.edges.filter(edge => {
        if (edge.source !== source) return false
        const connected_subnet = edge.target
        const linksConnectedtoSubnet = data.edges.filter(edge => edge.target == connected_subnet)
        return linksConnectedtoSubnet.length === 1
    })
    const nodes = [center_device]
    const edges = connected_links.map(link => {
        // const new_target = _.cloneDeep(link.target)
        const new_target = structuredClone(link.target)
        nodes.push(new_target)
        return {
            ...link,
            source: center_device,
            target: new_target,
        }
    })
    return { nodes, edges }
}

export async function getTrunkedSubnets (source, target, data) {
    const trunked_subnets = data.subnets.filter(subnet => {
        const connected_links = data.edges.filter(edge => edge.target == subnet)

        if (connected_links.length !== 2) {
            return false
        }

        return (connected_links[0].source == source && connected_links[1].source == target)
            || (connected_links[0].source == target && connected_links[1].source == source)
    })

    // const source_device = _.cloneDeep(source)
    const source_device = structuredClone(source)
    // const target_device = _.cloneDeep(target)
    const target_device = structuredClone(target)
    const nodes = [source_device, target_device]
    source_device.displayGroup = 1
    target_device.displayGroup = 2
    const edges = []
    trunked_subnets.forEach(subnet => {
        // const new_subnet = _.cloneDeep(subnet)
        const new_subnet = structuredClone(subnet)
        new_subnet.displayGroup = 0
        nodes.push(new_subnet)
        const connected_links = data.edges.filter(edge => edge.target == subnet)
        connected_links.forEach(connected_link => {
            if (connected_link.source == source) {
                edges.push({
                    ...connected_link,
                    source: source_device,
                    target: new_subnet,
                })
            } else {
                edges.push({
                    ...connected_link,
                    source: target_device,
                    target: new_subnet,
                })
            }
        })
    })
    return { nodes, edges }
}

export function findNode ({ nodes }, value) {
    return nodes.find(node => node.subnet === value || node.name === value)
}

export function findAndFocus (diagram, value) {
    const node = findNode(diagram, value)

    if (node) {
        Zoom.focusOnNode(diagram, node)
        return true
    } else {
        return false
    }
}
