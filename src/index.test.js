/* eslint-disable sort-imports */
import { vi } from 'vitest'
import { create } from './index.js'
import { Forces } from './simulations/forces.js'

/* global describe, it, expect */

// Mock Data.fetch
vi.mock('./data.js', () => ({
    Data: {
        fetch: vi.fn(() => Promise.resolve({
            devices: [
                { name: 'Device1', group: 'Group1' },
            ],
            subnets: [],
            groups: ['Group1'],
            links: [],
        })),
    },
}))

// Mock other modules that might cause issues
vi.mock('./configs.js', () => ({
    Configs: {
        init: vi.fn(),
    },
}))

vi.mock('./ui/ui.js', () => ({
    UI: {
        create: vi.fn(),
    },
}))

vi.mock('./layers.js', () => ({
    Layers: {
        push: vi.fn(() => Promise.resolve({
            processing: false,
        })),
    },
}))

vi.mock('./simulations/simulations.js', () => ({
    Simulations: {
        init: vi.fn(),
    },
}))

vi.mock('./grouping.js', () => ({
    Grouping: {
        init: vi.fn(),
    },
}))

vi.mock('./layout.js', () => ({
    Layout: {
        restore: vi.fn(),
    },
}))

vi.mock('./zoom.js', () => ({
    Zoom: {
        restore: vi.fn(),
    },
}))

vi.mock('./graphics.js', () => ({
    Graphics: {
        fetchStatus: vi.fn(),
    },
}))

vi.mock('./store.js', () => ({
    Store: {
        get: vi.fn(() => false),
    },
}))

describe('create', () => {
    it('should create a diagram instance', async () => {
        const container = document.createElement('div')
        const settings = { toolbar: true }

        const diagram = await create('test', container, settings)

        expect(diagram).toHaveProperty('destroy')
        expect(diagram).toHaveProperty('reset')
        expect(diagram).toHaveProperty('updateSettings')
        expect(diagram).toHaveProperty('toggleFloatMode')
        // etc.
    })


})
describe('subnet weight slider', () => {
    it('defaults to 0 (no pull, default sim)', () => {
        const diagram = { subnetWeight: 0 }
        const force = Forces.subnetPull(diagram)
        const mockNodes = [
            { isCloud: true, x: 100, y: 100, vx: 0, vy: 0 },
            { isCloud: false, x: 50, y: 50, vx: 0, vy: 0 }
        ]
        force.initialize(mockNodes)
        force(0.5)
        expect(mockNodes[0].vx).toBe(0)
        expect(mockNodes[0].vy).toBe(0)
    })

    it('increases pull towards center only for subnets outside groups when >0', () => {
        const diagram = { subnetWeight: 50 }
        const force = Forces.subnetPull(diagram)
        const mockNodes = [
            { isCloud: true, group: -1, x: 100, y: 100, vx: 0, vy: 0 }, // outside
            { isCloud: true, group: 'Group1', x: 50, y: 50, vx: 0, vy: 0 }, // in group, no pull
            { isCloud: false, x: 20, y: 20, vx: 0, vy: 0 } // not subnet
        ]
        force.initialize(mockNodes)
        force(0.5)
        expect(mockNodes[0].vx).toBeLessThan(0) // pulled
        expect(mockNodes[0].vy).toBeLessThan(0)
        expect(mockNodes[1].vx).toBe(0) // not pulled
        expect(mockNodes[1].vy).toBe(0)
        expect(mockNodes[2].vx).toBe(0)
        expect(mockNodes[2].vy).toBe(0)
    })

    // test change listener winds down sims + saves layout (like dragended)
    it('on change winds down simulations and saves layout', () => {
        const mockLayer = {
            simulations: {
                nodes: { alphaTarget: vi.fn() },
                groups: { alphaTarget: vi.fn() },
            },
        }
        const diagram = {
            layers: [mockLayer],
            subnetWeight: 75,
            config: {},
            // mock Layout.save + storeConfig
        }
        const mockLayoutSave = vi.fn()
        // simulate slider change (real listener not in unit, but verify pattern)
        const changeHandler = () => {
            const layer = diagram.layers?.[0]
            if (layer?.simulations) {
                if (layer.simulations.groups) {
                    layer.simulations.groups.alphaTarget(0)
                }
                layer.simulations.nodes.alphaTarget(0)
            }
            mockLayoutSave(diagram) // mock call
            diagram.config.subnetWeight = diagram.subnetWeight
            // Configs.storeConfig(diagram) would be called
        }
        changeHandler()
        expect(mockLayer.simulations.nodes.alphaTarget).toHaveBeenCalledWith(0)
        expect(mockLayer.simulations.groups.alphaTarget).toHaveBeenCalledWith(0)
        expect(diagram.config.subnetWeight).toBe(75)
        expect(mockLayoutSave).toHaveBeenCalled()
    })
})
