import { vi } from 'vitest'
import {
    debounce,
    throttle,
    parseJSON,
    removeDuplicatedLinks,
    generateEdgeKey,
    isNodeVisible,
    inInteractMode,
    haveIntersection,
} from './utils.js'

describe('utils', () => {
    describe('debounce', () => {
        it('should debounce function calls', async () => {
            const mockFn = vi.fn()
            const debounced = debounce(mockFn, 100)

            debounced()
            debounced()
            debounced()

            await new Promise(resolve => setTimeout(resolve, 150))
            expect(mockFn).toHaveBeenCalledTimes(1)
        })
    })

    describe('throttle', () => {
        it('should throttle function calls', async () => {
            const mockFn = vi.fn()
            const throttled = throttle(mockFn, 100)

            throttled()
            throttled()
            throttled()

            await new Promise(resolve => setTimeout(resolve, 50))
            expect(mockFn).toHaveBeenCalledTimes(1)
        })
    })

    describe('parseJSON', () => {
        it('should parse valid JSON', () => {
            const result = parseJSON('{"key": "value"}')
            expect(result).toEqual({ key: 'value' })
        })

        it('should return original value if not string', () => {
            const result = parseJSON({ key: 'value' })
            expect(result).toEqual({ key: 'value' })
        })

        it('should return false for invalid JSON', () => {
            const result = parseJSON('{invalid}')
            expect(result).toBe(false)
        })
    })

    describe('removeDuplicatedLinks', () => {
        it('should remove duplicated links', () => {
            const links = [
                { source: 'a', target: 'b' },
                { source: 'a', target: 'b' },
                { source: 'c', target: 'd' },
            ]
            const result = removeDuplicatedLinks(links)
            expect(result).toEqual([
                { source: 'a', target: 'b' },
                { source: 'c', target: 'd' },
            ])
        })
    })

    describe('generateEdgeKey', () => {
        it('should generate key with smaller first', () => {
            const result = generateEdgeKey('a', 'b')
            expect(result).toBe('a:b')
        })

        it('should generate key with smaller first swapped', () => {
            const result = generateEdgeKey('b', 'a')
            expect(result).toBe('a:b')
        })
    })

    describe('isNodeVisible', () => {
        it('should check visibility for cloud node', () => {
            const node = { isCloud: true, id: 'subnet1' }
            const config = { subnets: new Set(['subnet1']), devices: new Set() }
            const result = isNodeVisible(node, config)
            expect(result).toBe(true)
        })

        it('should check visibility for device node', () => {
            const node = { isCloud: false, id: 'device1' }
            const config = { devices: new Set(['device1']), subnets: new Set() }
            const result = isNodeVisible(node, config)
            expect(result).toBe(true)
        })
    })

    describe('inInteractMode', () => {
        it('should return true if shiftKey', () => {
            const event = { shiftKey: true }
            expect(inInteractMode(event)).toBe(true)
        })

        it('should return true if sourceEvent shiftKey', () => {
            const event = { sourceEvent: { shiftKey: true } }
            expect(inInteractMode(event)).toBe(true)
        })

        it('should return false otherwise', () => {
            const event = {}
            expect(inInteractMode(event)).toBe(false)
        })
    })

    describe('haveIntersection', () => {
        it('should detect intersection', () => {
            const diagram = { settings: { groupBorderWidth: 10 } }
            const r1 = { x: 0, y: 0, width: 100, height: 100 }
            const r2 = { x: 50, y: 50, width: 100, height: 100 }
            expect(haveIntersection(diagram, r1, r2)).toBe(true)
        })

        it('should not detect intersection', () => {
            const diagram = { settings: { groupBorderWidth: 10 } }
            const r1 = { x: 0, y: 0, width: 50, height: 50 }
            const r2 = { x: 100, y: 100, width: 50, height: 50 }
            expect(haveIntersection(diagram, r1, r2)).toBe(false)
        })
    })
})