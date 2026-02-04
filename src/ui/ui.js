'use strict'
import { SliderBar } from './sliderbar.js'
import { Toolbar } from './toolbar.js'
import { select as d3Select } from 'd3-selection'

function create (diagram, container) {
    const dom = diagram.dom = {}

    // dom.container = d3Select(container).classed("diagram", true).classed("widget-mode", Utils.isWidget())
    dom.container = d3Select(container).classed('diagram', true)

    // fixme dom.container.append(() => this.tabbar.create(diagram)) <- remove

    const toolbarWrapper = dom.container.append('div').attr('class', 'toolbar-wrapper')

    toolbarWrapper.append(() => Toolbar.create(diagram))
    toolbarWrapper.append(() => SliderBar.create(diagram))

    dom.visContainer = dom.container.append('div')
        .style('position', 'relative')
        .style('width', '100%')
        .style('height', '100%')
        .attr('class', 'grabbable')

    dom.tooltipDiv = dom.container
        .append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0)
        .style('z-index', -1)

    dom.tooltipInner = dom.tooltipDiv
        .append('div')
        .style('white-space', 'pre-line')
        .attr('class', 'tooltip-inner')
}

function teardown ({ dom }) {
    const containerEl = dom.container.node()

    while (containerEl.firstElementChild) {
        containerEl.firstElementChild.remove()
    }
}
//
// /**
//  * @deprecated
//  */
// function updateFloatModeBar (diagram) {
//     const toolbar = document.querySelector(".toolbar")
//     if (toolbar) {
//         let mode = FLOATMODE.FLOAT_ALL
//         if (GLOBAL_ACTIVE_TAB) {
//             const activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)
//             if (activeTab) {
//                 diagram.settings.floatMode = mode = activeTab.floatMode
//             }
//         }
//         toolbar.querySelectorAll(".button").forEach(button => {
//             button.classList.remove("active")
//         })
//         toolbar.querySelector(`[data-id='${mode}']`).classList.add("active")
//     }
// }

export const UI = {
    create,
    teardown,
}
