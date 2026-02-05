'use strict'
import { Configs } from './configs.js'
import { Layers } from './layers.js'

function remove_group (diagram, d) {
    const data = diagram.data
    const config = diagram.config
    const all_devices_in_group = data.devices.filter(device => device.group == d)
    const all_subnets_in_group = data.subnets.filter(subnet => subnet.group == d)
    all_devices_in_group.forEach(device => {
        config.devices.delete(device.id)
    })
    all_subnets_in_group.forEach(subnet => {
        config.subnets.delete(subnet.id)
    })
    config.groups.delete(d)

    Configs.storeConfig(diagram)
    Layers.refreshLayer(diagram)
}

function remove_node (diagram, d) {
    const data = diagram.data
    const config = diagram.config
    if (d.isCloud) {
        config.subnets.delete(d.id)
    } else {
        config.devices.delete(d.id)
    }

    const all_devices_in_group = data.devices.filter(device => device.group == d.group)
    const all_subnets_in_group = data.subnets.filter(subnet => subnet.group == d.group)
    let should_group_displayed = false

    all_devices_in_group.forEach(device => {
        if (config.devices.has(device.id)) {
            should_group_displayed = true
        }
    })

    all_subnets_in_group.forEach(subnet => {
        if (config.subnets.has(subnet.id)) {
            should_group_displayed = true
        }
    })

    if (should_group_displayed) {
        config.groups.add(d.group)
    } else {
        config.groups.delete(d.group)
    }

    Configs.storeConfig(diagram)
    Layers.refreshLayer(diagram)
}

function update (config) {
    document.querySelectorAll('.group-checkbox').forEach(checkbox => {
        checkbox.checked = config.isSet ? config.groups.has(checkbox.dataset.id) : true
    })

    document.querySelectorAll('.device-checkbox').forEach(checkbox => {
        checkbox.checked = config.isSet ? config.devices.has(checkbox.dataset.id) : true
    })

    document.querySelectorAll('.subnet-checkbox').forEach(checkbox => {
        checkbox.checked = config.isSet ? config.subnets.has(checkbox.dataset.id) : true
    })
}

function showSettingModal (diagram) {
    update(diagram.config)
    var modal = document.getElementsByClassName('setting-modal-container')[0]
    modal.style.display = 'flex'
    document.querySelectorAll('.tree-item').forEach(item => {
        item.style.display = 'block'
        item.classList.remove('expanded')
    })
}

function applySettings (diagram) {

    const config = diagram.config
    config.isSet = true

    document.querySelectorAll('.group-checkbox').forEach(groupCheckbox => {
        if (groupCheckbox.checked) {
            config.groups.add(groupCheckbox.dataset.id)
        } else {
            config.groups.delete(groupCheckbox.dataset.id)
        }
    })

    document.querySelectorAll('.device-checkbox').forEach(deviceCheckbox => {
        if (deviceCheckbox.checked) {
            config.devices.add(deviceCheckbox.dataset.id)
        } else {
            config.devices.delete(deviceCheckbox.dataset.id)
        }
    })

    document.querySelectorAll('.subnet-checkbox').forEach(subnetCheckbox => {
        config.subnets[subnetCheckbox.dataset.id] = subnetCheckbox.checked
        if (subnetCheckbox.checked) {
            config.subnets.add(subnetCheckbox.dataset.id)
        } else {
            config.subnets.delete(subnetCheckbox.dataset.id)
        }
    })

    Configs.storeConfig(diagram)
    Layers.refreshLayer(diagram)
}

function search (searchString) {
    if (searchString === '') {
        document.querySelectorAll('.tree-item').forEach(item => {
            item.style.display = 'block'
            item.classList.remove('expanded')
        })
        return
    }

    document.querySelectorAll('.tree-item').forEach(item => {
        item.style.display = 'none'
    })

    const searchValue = searchString.toLowerCase()

    const tree = document.querySelector('.tree')
    const groups = tree.querySelectorAll('.tree-item.group')

    groups.forEach(group => {
        const title = group.querySelector('.tree-title').textContent
        if (title.toLowerCase().includes(searchValue)) {
            group.style.display = 'block'
            group.classList.add('expanded')
            group.querySelectorAll('.tree-item').forEach(item => {
                item.style.display = 'block'
            })
        } else {
            let should_group_displayed = false
            group.querySelectorAll('.tree-item').forEach(item => {
                if (item.querySelector('.tree-title').textContent.toLowerCase().includes(searchValue)) {
                    item.style.display = 'block'
                    should_group_displayed = true
                }
            })
            if (should_group_displayed) {
                group.classList.add('expanded')
                group.style.display = 'block'
            }
        }
    })

    const isolated_subnets = tree.querySelectorAll('.tree-item.subnet')
    isolated_subnets.forEach(subnet => {
        if (subnet.querySelector('.tree-title').textContent.toLowerCase().includes(searchValue)) {
            subnet.style.display = 'block'
        }
    })
}

function init (diagram) {
    const data = diagram.data
    const config = diagram.config
    const modal = document.createElement('dialog')

    modal.classList.add('setting-modal-container')

    let str = `
    <div class="modal-content">
      <div class="setting-modal-header">
        <span class="setting-close">&times;</span>
        <div class="title">Edit Elements</div>
      </div>
      <div class="setting-modal-body">
        <div class="modal-toolbar">
          <div>
            <a class="action_select_all">Select All</a>
          </div>
          <div>
            <a class="action_deselect_all">De-Select All</a>
          </div>
        </div>
        <div class="modal-searchbar">
          <div class="search-container">
            <input type="text" class="search-input">
            <button class="clear-button" id="clear-button" aria-label="Clear search">&times;</button>
          </div>
          <button class="search element-search">Search</button>
        </div>
        <ul class="tree">`
    data.groups.forEach(group => {
        str += `
          <li class="tree-item group">
            <div class="tree-title group">
              <span class="toggle">▶</span>
              <input type="checkbox" class="group-checkbox" ${config.groups.has(group.id) ? 'checked' : ''} data-id="${group.id}">
              ${group.id}
            </div>
            <ul class="children">`
        data.devices.forEach(device => {
            if (device.group == group.id) {
                str += `
              <li class="tree-item device">
                <div class="tree-title device">
                  <input type="checkbox" class="device-checkbox" ${config.devices.has(device.id) ? 'checked' : ''} data-id="${device.id}">
                  ${device.name}
                </div>
              </li>`
            }
        })
        data.subnets.forEach(subnet => {
            if (subnet.group == group.id) {
                str += `
              <li class="tree-item subnet">
                <div class="tree-title subnet">
                  <input type="checkbox" class="subnet-checkbox" ${config.subnets.has(subnet.id) ? 'checked' : ''} data-id="${subnet.id}">
                  ${subnet.subnet}
                </div>
              </li>`
            }
        })
        str += '</ul></li>'
    })

    const orphanSubnets = data.subnets.filter(subnet => subnet.group === -1)
    if (orphanSubnets.length > 0) {
        str += `<li class="tree-item group">
            <div class="tree-title group">
                <span class="toggle">▶</span>
                <input type="checkbox" class="group-checkbox" ${config.groups.has(-1) ? 'checked' : ''} data-id="-1">
                INTER-GROUP SUBNETS
            </div>
        <ul class="children">`

        orphanSubnets.forEach(subnet => {
            str += `<li class="tree-item subnet">
                <div class="tree-title subnet">
                    <input type="checkbox" class="subnet-checkbox" ${config.subnets.has(subnet.id) ? 'checked' : ''} data-id="${subnet.id}">
                    ${subnet.subnet}
                </div>
            </li>`
        })

        str += '</ul></li>'
    }
    str += `
        </ul>
      </div>
      <div class="setting-modal-footer">
        <button class="action setting-reset">Reset</button>
        <div>
          <button class="action setting-confirm">Ok</button>
          <button class="action setting-cancel">Cancel</button>
        </div>
      </div>
    </div>`
    modal.innerHTML = str
    document.body.appendChild(modal)

    document.querySelectorAll('.toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const parent = toggle.parentElement
            parent.parentElement.classList.toggle('expanded')
            toggle.textContent = parent.parentElement.classList.contains('expanded') ? '▼' : '▶'
        })
    })

    document.querySelectorAll('.group-checkbox').forEach(groupCheckbox => {
        groupCheckbox.addEventListener('change', () => {
            const childrenCheckboxes = groupCheckbox.closest('.tree-item').querySelectorAll('.device-checkbox, .subnet-checkbox')
            childrenCheckboxes.forEach(childCheckbox => (childCheckbox.checked = groupCheckbox.checked))
        })
    })

    document.querySelectorAll('.device-checkbox, .subnet-checkbox').forEach(deviceCheckbox => {
        deviceCheckbox.addEventListener('change', () => {
            const parentGroup = deviceCheckbox.closest('.tree-item.group')
            if (!parentGroup) return
            const parentGroupCheckbox = parentGroup.querySelector('.group-checkbox')

            if (!deviceCheckbox.checked) {
                const all_children = Array.from(parentGroup.querySelectorAll('.device-checkbox, .subnet-checkbox'))

                if (all_children.every(childCheckbox => childCheckbox.checked === false)) {
                    parentGroupCheckbox.checked = false
                }
            } else {
                parentGroupCheckbox.checked = true
            }
        })
    })

    document.querySelectorAll('.subnet-checkbox').forEach(subnetCheckbox => {
        subnetCheckbox.addEventListener('change', () => {
            const dataId = subnetCheckbox.dataset.id
            document.querySelectorAll(`.subnet-checkbox[data-id="${dataId}"]`).forEach(sameCheckbox => (sameCheckbox.checked = subnetCheckbox.checked))
        })
    })

    const span = document.getElementsByClassName('setting-close')[0]
    span.addEventListener('click', () => {
        modal.style.display = 'none'
    })

    const select_all_btn = document.getElementsByClassName('action_select_all')[0]
    select_all_btn.addEventListener('click', () => {
        document.getElementsByClassName('tree')[0].querySelectorAll('.group-checkbox, .device-checkbox, .subnet-checkbox')
            .forEach(checkbox => (checkbox.checked = true))
    })

    const deselect_all_btn = document.getElementsByClassName('action_deselect_all')[0]
    deselect_all_btn.addEventListener('click', () => {
        document.getElementsByClassName('tree')[0].querySelectorAll('.group-checkbox, .device-checkbox, .subnet-checkbox')
            .forEach(checkbox => (checkbox.checked = false))
    })

    const resetSetting = document.getElementsByClassName('setting-reset')[0]
    resetSetting.addEventListener('click', () => {
        update(config)
    })

    const confirmSetting = document.getElementsByClassName('setting-confirm')[0]
    confirmSetting.addEventListener('click', () => {
        applySettings(diagram)
        modal.style.display = 'none'
    })
    const cancelSetting = document.getElementsByClassName('setting-cancel')[0]
    cancelSetting.addEventListener('click', () => {
        modal.style.display = 'none'
    })

    const searchInput = document.getElementsByClassName('search-input')[0]
    const clearButton = document.getElementById('clear-button')

    searchInput.addEventListener('change', () => {
        search(searchInput.value)
    })

    clearButton.addEventListener('click', () => {
        searchInput.value = ''
        search('')
    })

    const searchBtn = document.getElementsByClassName('element-search')[0]
    searchBtn.addEventListener('click', () => {
        search(searchInput.value)
    })
}

function hideUnconnectedSubnets (diagram) {
    const data = diagram.data
    const config = diagram.config

    // Find connected subnets (those with edges to devices)
    const connectedSubnets = new Set()
    data.edges.forEach(edge => {
        const source = edge.source
        const target = edge.target
        if (source.isCloud && !target.isCloud) {
            connectedSubnets.add(source.id)
        } else if (!source.isCloud && target.isCloud) {
            connectedSubnets.add(target.id)
        }
    })

    // Remove unconnected subnets from config
    data.subnets.forEach(subnet => {
        if (!connectedSubnets.has(subnet.id)) {
            config.subnets.delete(subnet.id)
        }
    })

    Configs.storeConfig(diagram)
    Layers.refreshLayer(diagram)
}

function restoreAllSubnets (diagram) {
    const data = diagram.data
    const config = diagram.config

    // Restore all subnets to the config
    data.subnets.forEach(subnet => {
        config.subnets.add(subnet.id)
    })

    Configs.storeConfig(diagram)
    Layers.refreshLayer(diagram)
}

function showOptionsModal (diagram) {
    let modal = document.querySelector('.options-modal-container')
    if (!modal) {
        modal = document.createElement('dialog')
        modal.classList.add('options-modal-container')
        modal.innerHTML = `
            <div class="modal-content">
                <div class="options-modal-header">
                    <span class="options-close">&times;</span>
                    <div class="title">Options</div>
                </div>
                <div class="options-modal-body">
                    <div>
                        <input type="checkbox" id="sound_check">
                        <label for="sound_check" style="margin-bottom: 0; margin-left: 5px;">Sound</label>
                    </div>
                    <div>
                        <input type="checkbox" id="hide_unconnected_subnets">
                        <label for="hide_unconnected_subnets" style="margin-bottom: 0; margin-left: 5px;">Don't show unconnected subnets</label>
                    </div>
                </div>
                <div class="options-modal-footer">
                    <button class="action options-confirm">Ok</button>
                </div>
            </div>`
        document.body.appendChild(modal)

        const span = modal.querySelector('.options-close')
        span.addEventListener('click', () => {
            modal.close()
        })

        const confirmBtn = modal.querySelector('.options-confirm')
        confirmBtn.addEventListener('click', () => {
            const soundEnabled = modal.querySelector('#sound_check').checked
            const hideUnconnected = modal.querySelector('#hide_unconnected_subnets').checked

            // Update config with current checkbox states
            diagram.config.sound = soundEnabled
            diagram.config.hideUnconnectedSubnets = hideUnconnected

            // Apply hide/restore logic based on checkbox
            if (hideUnconnected) {
                hideUnconnectedSubnets(diagram)
            } else {
                // Restore all subnets when checkbox is unchecked
                restoreAllSubnets(diagram)
            }

            // Persist config to localStorage
            Configs.storeConfig(diagram)

            modal.close()
        })
    }

    // Set checkbox states from current config when opening dialog
    const soundCheck = modal.querySelector('#sound_check')
    const hideUnconnectedCheck = modal.querySelector('#hide_unconnected_subnets')

    soundCheck.checked = diagram.config.sound !== undefined ? diagram.config.sound : true
    hideUnconnectedCheck.checked = diagram.config.hideUnconnectedSubnets !== undefined ? diagram.config.hideUnconnectedSubnets : false

    modal.showModal()
}

export const Panels = {
    showSettingModal,
    showOptionsModal,
    hideUnconnectedSubnets,
    restoreAllSubnets,
    remove_group,
    init,
    remove_node,
}
