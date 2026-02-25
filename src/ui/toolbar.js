'use strict'
/*global visioExport*/
import { Configs } from '../configs.js'
import { Grouping } from '../grouping.js'
import { Layout } from '../layout.js'
import { SearchForm } from './search.js'
import { Zoom } from '../zoom.js'

function doVisioExport ({ nodes, edges, groups, focusedGroup, data }) {
    let exportData
    let name = 'TotalView Diagram-'

    if (focusedGroup > -1) {
        exportData = {
            nodes: nodes.filter(n => n.group === focusedGroup),
            edges: edges.filter(e => e.source.group === focusedGroup && e.target.group === focusedGroup),
            data,
        }
        name += groups[focusedGroup].name
    } else {
        exportData = { nodes, edges, groups, data }
        name += 'Main'
    }
    visioExport.generate(exportData, name)
}

function styleModeButtons (diagram, mode) {
    const modeToggle = document.querySelector('.mode-toggle')
    if (modeToggle) {
        modeToggle.querySelectorAll('g').forEach(modeParent => {
            if (Number.parseInt(modeParent.dataset.id) === mode) {
                modeParent.classList.add('active')
            } else {
                modeParent.classList.remove('active')
            }
        })
    }
}

function toggleFloatMode (diagram, mode) {
    diagram.settings.floatMode = mode
    styleModeButtons(diagram, mode)

    if (!diagram.layers || diagram.layers.length === 0) return

    const { currentLayer, floatModes } = diagram
    if (mode === floatModes.floatAll) {
        diagram.graphics.nodes.each(d => {
            d.fx = null
            d.fy = null
        })
        currentLayer.groups.forEach(g => {
            g.fx = null
            g.fy = null
        })
    } else if (mode === floatModes.lockAll) {
        diagram.graphics.nodes.each(d => {
            d.fx = d.x
            d.fy = d.y
        })
        currentLayer.groups.forEach(g => {
            g.fx = g.x
            g.fy = g.y
        })
    }

    Layout.save(diagram)
    Configs.storeConfig(diagram)
}

function create (diagram) {
    const { dom, settings, autocompleteItems, floatModes } = diagram
    const toolbar = dom.toolbar = document.createElement('div')
    const mode = diagram.config.floatMode || floatModes.floatAll

    diagram.settings.floatMode = mode
    diagram.subnetWeight = diagram.config.subnetWeight ?? 0

    toolbar.classList.add('toolbar')
    toolbar.innerHTML += `
        <form class="search-form" autocomplete="off">
            <div class="autocomplete">
                <input type="text" placeholder="Search">
            </div>
            <svg class="button search">
                <g>
                    <rect height="100%" width="34px"></rect>
                    <text class="button-label" x="3" y="13">Search</text>
                </g>
            </svg>
        </form>
        <svg class="zoom-controls">
            <g>
                <g class="zoom-in">
                    <rect class="plusMinusBox" width="19px" height="100%"></rect>
                    <line id="plusHorizontal" x1="4.5" y1="10" x2="14.5" y2="10"></line>
                    <line id="plusVertical" x1="9.5" y1="5" x2="9.5" y2="15"></line>
                </g>
                <g class="zoom-out">
                    <rect class="plusMinusBox" width="19px" height="100%"></rect>
                    <line id="minusLine" x1="4.5" y1="10" x2="14.5" y2="10"></line>
                </g>
            </g>
        </svg>
        <svg class="mode-toggle">
            <g class="button float-all" data-id="${floatModes.floatAll}">
                <rect height="100%" width="40px"></rect>
                <text class="button-label float-all" x="4.5" y="13">Float All</text>
            </g>
            <g class="button float" data-id="${floatModes.float}">
                <rect height="100%" width="40px"></rect>
                <text class="button-label float" x="9.5" y="13">Float</text>
            </g>
            <g class="button lock" data-id="${floatModes.lock}">
                <rect height="100%" width="40px"></rect>
                <text class="button-label lock" x="10" y="13">Lock</text>
            </g>
            <g class="button lock-all" data-id="${floatModes.lockAll}">
                <rect height="100%" width="40px"></rect>
                <text class="button-label lock-all" x="4.5" y="13">Lock All</text>
            </g>
        </svg>
        <div class="button visio-export">
            <img src="assets/img/VisioIcon.png" title="Download Visio" alt="visio">
        </div>
        <div class="button detach">
            <a id="detach">Detach</a>
        </div>
        <div class="subnet-weight">
            <label for="subnet-weight">Subnet weight:</label>
            <input type="range" id="subnet-weight" min="0" max="100" value="${diagram.subnetWeight}" step="1">
        </div>
        <div class="groupings-toggle" style="display: none">
            <input type="checkbox">
            <label class="label">Grouping</label>
        </div>
        <audio id="downAudio" src="assets/sounds/down.mp3"></audio>`

    const searchFormInput = toolbar.querySelector('.search-form input')

    toolbar.querySelector('.zoom-in').addEventListener('click', () => Zoom.increment(diagram))
    toolbar.querySelector('.zoom-out').addEventListener('click', () => Zoom.decrement(diagram))
    toolbar.querySelector(`[data-id='${mode}']`).classList.add('active')
    toolbar.querySelector('.button.float-all').addEventListener('click', () => {
        toggleFloatMode(diagram, floatModes.floatAll)
    })
    toolbar.querySelector('.button.float').addEventListener('click', () => {
        toggleFloatMode(diagram, floatModes.float)
    })
    toolbar.querySelector('.button.lock').addEventListener('click', () => {
        toggleFloatMode(diagram, floatModes.lock)
    })
    toolbar.querySelector('.button.lock-all').addEventListener('click', () => {
        toggleFloatMode(diagram, floatModes.lockAll)
    })
    toolbar.querySelector('.button.visio-export').addEventListener('click', () => doVisioExport(diagram))
    toolbar.querySelector('.button.search').addEventListener('click', () => SearchForm.search(diagram, searchFormInput.value))
    toolbar.querySelector('#detach').addEventListener('click', event => {
        event.preventDefault()
        // FIXME get rid of global use
        // eslint-disable-next-line no-undef
        openWindow('diagramdetach.html?c=' + diagram.id,1000,600)
    })

    const weightSlider = toolbar.querySelector('#subnet-weight')
    weightSlider.addEventListener('input', e => {
        diagram.subnetWeight = Number.parseInt(e.target.value)
        const layer = diagram.layers?.[0]
        if (layer.simulations.groups) {
            layer.simulations.groups.alphaTarget(0.7).restart()
        }
        if (layer.simulations.nodes) {
            layer.simulations.nodes.alphaTarget(0.7).restart()
        }
    })
    weightSlider.addEventListener('change', () => {
        const layer = diagram.layers?.[0]
        if (layer.simulations.groups) {
            layer.simulations.groups.alphaTarget(0)
        }
        if (layer.simulations.nodes) {
            layer.simulations.nodes.alphaTarget(0)
        }
        Layout.save(diagram)
        diagram.config.subnetWeight = diagram.subnetWeight
        Configs.storeConfig(diagram)
    })

    if (!settings.detachable) {
        toolbar.querySelector('.button.detach').style.display = 'none'
    }

    const groupingToggle = toolbar.querySelector('.groupings-toggle input')
    groupingToggle.checked = settings.grouping
    groupingToggle.addEventListener('click', () => Grouping.toggle(diagram))

    SearchForm.autocompleteSetup(diagram, searchFormInput, autocompleteItems)
    styleModeButtons(diagram)

    // hide if toggled off
    if (!settings.toolbar) {
        toolbar.style.display = 'none'
    }

    return toolbar
}

function toggle ({ dom, settings }) {
    settings.toolbar = !settings.toolbar
    dom.toolbar.style.display = settings.toolbar ? 'block' : 'none'
    dom.sliderbar.style.display = settings.toolbar ? 'block' : 'none'
}

export const Toolbar = {
    create,
    toggle,
    toggleFloatMode,
    doVisioExport,
}
