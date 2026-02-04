'use strict'
import { generateEdgeKey, getTextWidth, isNodeVisible, removeDuplicatedLinks } from './utils.js'
import { Graphics } from './graphics.js'
import { json as d3Json } from 'd3-fetch'

function fetchData (url) {
    return new Promise((resolve, reject) => {
        // d3Json(url, (error, graph) => {
        //     if (error) {
        //         reject(error)
        //     } else {
        //         resolve(graph)
        //     }
        // })
        d3Json(url).then(resolve, reject)
    })
}

function inPubInt (subnet) {
    let splitSubnet = subnet.split('.')

    switch (splitSubnet[0]) {
        case '10': {
            return false
        }
        case '169': {
            return splitSubnet[1] !== '254'
        }
        case '172': {
            return !(Number.parseInt(splitSubnet[1]) > 15 && Number.parseInt(splitSubnet[1]) < 32)
        }
        case '192': {
            return splitSubnet[1] !== '168'
        }
        default: {
            return true
        }
    }
}

function onlyHasOneDev ({ edges }, sub) {
    let count = 0

    for (const edge of edges) {
        if (edge.target === 'Cloud-' + sub) count++
    }

    if (count > 1) {
        // normal cloud, do nothing different
        return false
    }

    return true
}

// function process (diagram, layer, graph, first = false) {
function process (diagram, layer, graph) {
    const { autocompleteItems } = layer

    if (!graph.subnets) {
        graph.subnets = []
    }
    graph.subnets.forEach(sub => {
        sub.isCloud = true
        // for clouds, take subnet instead of name unless WAN cloud
        if (sub.isUnmanaged) {
            autocompleteItems.push(sub.name)
        } else {
            autocompleteItems.push(sub.subnet)
        }
    })
    graph.devices.forEach(node => autocompleteItems.push(node.name))

    // nodes = devices + subnets

    // graph.subnets.forEach(subnet => subnet.group = -1);
    const nodes = graph.devices.concat(graph.subnets)
    const edges = removeDuplicatedLinks(graph.links) ?? []
    const groups = graph.groups?.map(name => ({
        id: name,
        name: name.split('\\').pop(),
        title_width: getTextWidth(name),
        parent:  name.split('\\').slice(0, -1).join('\\'),
        hasChildGroup: graph.groups?.some(n => n.startsWith(name + '\\')),
    }))
    const modesMap = new Map(nodes.map(n => [n.name, n]))
    const cloudsLinkedGroups = new Map()

    edges.forEach(edge => {
        const source = modesMap.get(edge.source)
        const target = modesMap.get(edge.target)

        if (source) edge.source = source
        if (target) edge.target = target

        edge.width = edge.isStaticWan ? 5 : Graphics.getLinkWidth(edge.bandwidth)

        if (!source.isCloud && !target.isCloud) return

        if (source.isCloud && target.group) {
            if (cloudsLinkedGroups.has(source)) {
                const linkedGroups = cloudsLinkedGroups.get(source)
                linkedGroups.add(target.group)
                return
            }
            cloudsLinkedGroups.set(source, new Set([target.group]))
            return
        }
        if (target.isCloud && source.group) {
            if (cloudsLinkedGroups.has(target)) {
                const linkedGroups = cloudsLinkedGroups.get(target)
                linkedGroups.add(source.group)
                return
            }
            cloudsLinkedGroups.set(target, new Set([source.group]))
        }
    })

    nodes.forEach(node => {
        if (node.group != null) return
        if (!cloudsLinkedGroups.has(node)) {
            node.group = -1
            return
        }

        if (!node.isCloud) return

        const linkedGroups = Array.from(cloudsLinkedGroups.get(node))
        if (linkedGroups.length === 1) {
            node.group = linkedGroups[0]
            return
        }

        let possibleCommonGroup = linkedGroups[0]
        let isCommonGroup = false
        while (!isCommonGroup && possibleCommonGroup) {
            possibleCommonGroup = possibleCommonGroup.split('\\').slice(0, -1).join('\\')
            isCommonGroup = possibleCommonGroup && linkedGroups.every(group => (group === possibleCommonGroup) || group.startsWith(possibleCommonGroup + '\\'))
        }

        node.group = isCommonGroup ? possibleCommonGroup : -1
    })

    const config = diagram.config

    const filtered_nodes = nodes?.filter(node => {
        if (!config.isSet) return true
        return isNodeVisible(node, config)
    })
    const filtered_edges = edges?.filter(edge => {
        if (!config.isSet) return true
        return isNodeVisible(edge.source, config) && isNodeVisible(edge.target, config)
    })
    const filtered_groups = groups?.filter(group => {
        if (!config.isSet) return true
        return config.groups.has(group.id)
    })
    // Subnet summarization
    const new_nodes = []
    const new_edges = []
    filtered_nodes.forEach(selectedNode => {
        const connected_links = filtered_edges.filter(edge => {
            if (edge.source != selectedNode) return false
            const connected_subnet = edge.target
            const linksConnectedtoSubnet = filtered_edges.filter(edge => edge.target == connected_subnet)
            return linksConnectedtoSubnet.length === 1
        })

        if (connected_links.length > 1) {
            const summarized_subnet = {
                image: 'assets/graphics/summarized-cloud.png',
                isSummarized: true,
                name: selectedNode.name + ' - Summarized',
                // name: `${connected_links.length} Subnets`,
                subnet: '0.0.0.0',
                mask: '0.0.0.0',
                isCloud: true,
                group: selectedNode.group,
                totalSubnets: connected_links.length,
                source: selectedNode,
            }

            const summarized_edge = {
                source: selectedNode,
                target: summarized_subnet,
                width: 0,
                bandwidth: 0,
                warning: 0,
                isSummarized: true,
                totalSubnets: connected_links.length,
            }

            connected_links.forEach(connected_link => {
                summarized_edge.width += Number.parseInt(connected_link.width)
                summarized_edge.bandwidth += Number.parseInt(connected_link.bandwidth)
                filtered_edges.splice(filtered_edges.findIndex(edge => edge.ipAddress === connected_link.ipAddress), 1)
                filtered_nodes.splice(filtered_nodes.findIndex(node => node.subnet == connected_link.target.subnet), 1)
            })
            new_edges.push(summarized_edge)
            new_nodes.push(summarized_subnet)
        }
    })
    filtered_nodes.push(...new_nodes)
    filtered_edges.push(...new_edges)

    // Subnet summarization END

    // Trunk summarization
    const new_summarzied_edges = []
    const hiddenSubnets = []
    filtered_nodes.forEach(selectedNode => {
        if (selectedNode.isCloud) {
            const connected_links = filtered_edges.filter(edge => edge.target == selectedNode)
            if (connected_links.length === 2) {
                if (connected_links[0].source.group !== connected_links[1].source.group) {
                    const edgeKey = generateEdgeKey(connected_links[0].source.name, connected_links[1].source.name)
                    const alreadyExistedEdge = new_summarzied_edges.find(link => link.edgeKey === edgeKey)
                    if (!alreadyExistedEdge) {
                        new_summarzied_edges.push({
                            edgeKey,
                            source: connected_links[0].source,
                            target: connected_links[1].source,
                            isTrunked: true,
                            name: edgeKey,
                            totalSubnets: 2,
                            width: Math.min(connected_links[0].width, connected_links[1].width),
                        })
                    } else {
                        alreadyExistedEdge.width += Math.min(connected_links[0].width, connected_links[1].width)
                        alreadyExistedEdge.totalSubnets += 2
                    }
                    filtered_edges.splice(filtered_edges.findIndex(edge => edge.ipAddress === connected_links[0].ipAddress), 1)
                    filtered_edges.splice(filtered_edges.findIndex(edge => edge.ipAddress === connected_links[1].ipAddress), 1)
                    hiddenSubnets.push(selectedNode)
                    // nodes.splice(nodes.findIndex(node => node.subnet == selectedNode.subnet), 1)
                }
            }
        }
    })
    filtered_edges.push(...new_summarzied_edges)
    hiddenSubnets.forEach(hiddenSubnet => {
        filtered_nodes.splice(filtered_nodes.findIndex(node => node.subnet === hiddenSubnet.subnet), 1)
    })
    layer.nodes = filtered_nodes
    layer.edges = filtered_edges
    layer.groups = filtered_groups
    // Trunk summarization END
}

function downScaleBandwidth (val) {
    return [
        [100000000000, '100gig'],
        [50000000000, '50gig'],
        [40000000000, '40gig'],
        [25000000000, '25gig'],
        [20000000000, '20gig'],
        [10000000000, '10gig'],
        [1000000000, '1gig'],
        [100000000, '100meg'],
        [10000000, '10meg'],
        [0, `${val}bits`],
    ].find(([limit]) => val >= limit)[1]
}

export const Data = {
    fetch: fetchData,
    inPubInt,
    onlyHasOneDev,
    process,
    downScaleBandwidth,
}
