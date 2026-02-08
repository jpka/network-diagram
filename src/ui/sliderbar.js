'use strict'

import { Panels } from '../panels.js'

function create (diagram) {
    // const { dom, simulations } = diagram
    const { dom } = diagram

    const sliderbar = (dom.sliderbar = document.createElement('div'))

    // suspended?
    // let weight = DIAGRAM_WEIGHT.MIN
    // if (GLOBAL_ACTIVE_TAB) {
    //     const activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)
    //     if (activeTab) {
    //         weight = activeTab.weight
    //     }
    // }

    sliderbar.classList.add('sliderbar')
    // suspended?
    //   sliderbar.innerHTML += `
    //     <label for="cowbell">Weight: </label>
    //     <input type="range" id="cowbell" name="cowbell" min="0" max="100" value="90" step="5">
    // `

    sliderbar.innerHTML = '<button type="button" class="btn-link options-button">Options</button><button type="button" class="btn-link edit-elements-button">Edit Elements</button>'

    sliderbar.querySelector('.options-button').addEventListener('click', () => {
        Panels.showOptionsModal(diagram)
    })

    sliderbar.querySelector('.edit-elements-button').addEventListener('click', () => {
        Panels.showSettingModal(diagram)
    })

    if (!diagram.settings.toolbar) {
        sliderbar.style.display = 'none'
    }

    return sliderbar
}

// /** TODO
//  * @function destroy
//  * @param {Object} diagram
//  * @return {void}
//  */
// function destroy (diagram) {
//     // TODO clear DOM and event listeners
// }

export const SliderBar = {
    create,
    // destroy,
}
