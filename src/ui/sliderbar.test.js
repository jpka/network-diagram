import { vi } from 'vitest'
import { SliderBar } from './sliderbar.js'
import { Panels } from '../panels.js'

describe('SliderBar', () => {
    let mockDiagram

    beforeEach(() => {
        mockDiagram = {
            dom: {},
            settings: { toolbar: true },
        }
        // Clear document body
        document.body.innerHTML = ''
        // Mock the Panels functions
        vi.spyOn(Panels, 'showOptionsModal').mockImplementation(() => {})
        vi.spyOn(Panels, 'showSettingModal').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('create', () => {
        it('should create a sliderbar with Options and Edit Elements buttons', () => {
            const sliderbar = SliderBar.create(mockDiagram)

            expect(sliderbar.classList.contains('sliderbar')).toBe(true)
            expect(sliderbar.querySelector('.options-button')).toBeTruthy()
            expect(sliderbar.querySelector('.edit-elements-button')).toBeTruthy()
        })

        it('should call showOptionsModal when Options button is clicked', () => {
            const sliderbar = SliderBar.create(mockDiagram)

            const optionsButton = sliderbar.querySelector('.options-button')
            optionsButton.click()

            expect(Panels.showOptionsModal).toHaveBeenCalledWith(mockDiagram)
        })

        it('should call showSettingModal when Edit Elements button is clicked', () => {
            const sliderbar = SliderBar.create(mockDiagram)

            const editButton = sliderbar.querySelector('.edit-elements-button')
            editButton.click()

            expect(Panels.showSettingModal).toHaveBeenCalledWith(mockDiagram)
        })

        it('should hide sliderbar if toolbar is disabled', () => {
            mockDiagram.settings.toolbar = false
            const sliderbar = SliderBar.create(mockDiagram)

            expect(sliderbar.style.display).toBe('none')
        })
    })
})