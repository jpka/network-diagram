import { Graphics } from './graphics.js'

describe('Graphics', () => {
    describe('getFillColor', () => {
        it('should return green for healthy', () => {
            expect(Graphics.getFillColor('healthy')).toBe('green')
        })

        it('should return red for issues', () => {
            expect(Graphics.getFillColor('issues')).toBe('red')
        })

        it('should return yellow for warning', () => {
            expect(Graphics.getFillColor('warning')).toBe('yellow')
        })

        it('should return grey for offline', () => {
            expect(Graphics.getFillColor('offline')).toBe('grey')
        })

        it('should return black for down', () => {
            expect(Graphics.getFillColor('down')).toBe('black')
        })

        it('should return default for unknown', () => {
            expect(Graphics.getFillColor('unknown')).toBe('transparent')
        })

        it('should be case insensitive', () => {
            expect(Graphics.getFillColor('HEALTHY')).toBe('green')
        })
    })

    describe('getLinkWidth', () => {
        it('should return correct width for bandwidth', () => {
            expect(Graphics.getLinkWidth(10000000)).toBe(3)
            expect(Graphics.getLinkWidth(100000000)).toBe(4)
            expect(Graphics.getLinkWidth(1000000000)).toBe(5)
            expect(Graphics.getLinkWidth(10000000000)).toBe(6)
            expect(Graphics.getLinkWidth(25000000000)).toBe(7)
            expect(Graphics.getLinkWidth(50000000000)).toBe(8)
            expect(Graphics.getLinkWidth(100000000000)).toBe(9)
            expect(Graphics.getLinkWidth(200000000000)).toBe(10)
        })
    })
})