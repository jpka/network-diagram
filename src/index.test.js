import { vi } from 'vitest'
import { create } from './index.js'

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