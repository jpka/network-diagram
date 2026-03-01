import { vi } from 'vitest'
import { Data } from './data.js'

describe('Data', () => {
    describe('inPubInt', () => {
        it('should return false for 10.x.x.x', () => {
            expect(Data.inPubInt('10.0.0.1')).toBe(false)
        })

        it('should return true for 192.168.x.x', () => {
            expect(Data.inPubInt('192.168.1.1')).toBe(false)
        })

        it('should return true for public IPs', () => {
            expect(Data.inPubInt('8.8.8.8')).toBe(true)
        })

        it('should return false for 169.254.x.x', () => {
            expect(Data.inPubInt('169.254.1.1')).toBe(false)
        })

        it('should return false for 172.16-31.x.x', () => {
            expect(Data.inPubInt('172.20.1.1')).toBe(false)
        })
    })

    describe('onlyHasOneDev', () => {
        it('should return true if only one device connected to cloud', () => {
            const graph = {
                edges: [
                    { target: 'Cloud-192.168.1.0' },
                ]
            }
            expect(Data.onlyHasOneDev(graph, '192.168.1.0')).toBe(true)
        })

        it('should return false if multiple devices', () => {
            const graph = {
                edges: [
                    { target: 'Cloud-192.168.1.0' },
                    { target: 'Cloud-192.168.1.0' },
                ]
            }
            expect(Data.onlyHasOneDev(graph, '192.168.1.0')).toBe(false)
        })
    })

    describe('downScaleBandwidth', () => {
        it('should downscale bandwidth correctly', () => {
            expect(Data.downScaleBandwidth(100000000000)).toBe('100gig')
            expect(Data.downScaleBandwidth(1000000000)).toBe('1gig')
            expect(Data.downScaleBandwidth(100000000)).toBe('100meg')
            expect(Data.downScaleBandwidth(10000000)).toBe('10meg')
            expect(Data.downScaleBandwidth(1000000)).toBe('1000000bits')
        })
    })

    describe('process', () => {
        let diagram, layer, graph

        beforeEach(() => {
            diagram = {
                config: {
                    isSet: true,
                    groups: new Set(['Group1']),
                    devices: new Set(['Dev1']),
                    subnets: new Set(['Sub1', 'Sub2']),
                    subnetSummarization: true
                },
                data: {
                    subnets: [],
                    edges: []
                }
            }
            layer = {
                autocompleteItems: []
            }
            graph = {
                devices: [{ name: 'Dev1', group: 'Group1', id: 'Dev1' }],
                subnets: [
                    { name: 'Sub1', subnet: '10.0.1.0', group: 'Group1', id: 'Sub1' },
                    { name: 'Sub2', subnet: '10.0.2.0', group: 'Group1', id: 'Sub2' }
                ],
                links: [
                    { source: 'Dev1', target: 'Sub1', ipAddress: '10.0.1.1', width: '1', bandwidth: '1000' },
                    { source: 'Dev1', target: 'Sub2', ipAddress: '10.0.2.1', width: '1', bandwidth: '1000' }
                ],
                groups: ['Group1']
            }
        })

        it('should summarize subnets when subnetSummarization is true', () => {
            Data.process(diagram, layer, graph, true)
            const summarizedNodes = layer.nodes.filter(n => n.isSummarized)
            expect(summarizedNodes.length).toBe(1)
            expect(summarizedNodes[0].totalSubnets).toBe(2)
        })

        it('should NOT summarize subnets when subnetSummarization is false', () => {
            diagram.config.subnetSummarization = false
            Data.process(diagram, layer, graph, true)
            const summarizedNodes = layer.nodes.filter(n => n.isSummarized)
            expect(summarizedNodes.length).toBe(0)
            const subnets = layer.nodes.filter(n => n.isCloud && !n.isSummarized)
            expect(subnets.length).toBe(2)
        })
    })
})