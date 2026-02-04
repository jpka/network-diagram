'use strict'

import { findAndFocus, registerDocumentEventListener } from '../utils.js'

function search (diagram, value) {
    let exactMatch = findAndFocus(diagram, value)

    if (!exactMatch) {
        let items = diagram.dom.searchAutocompleteList.children
        if (items && items.length > 0) {
            items[0].click()
        }
    }
}

function autocompleteSetup (diagram, input) {
    const { dom } = diagram
    let list
    let currentFocus = -1

    function setActive (items) {
        if (!items) return false
        items[currentFocus].classList.add('autocomplete-active')
    }

    function removeActive (items) {
        if (!items || currentFocus < 0) return false
        items[currentFocus].classList.remove('autocomplete-active')
    }

    input.addEventListener('input', () => {
        const val = input.value
        const items = diagram.autocompleteItems
        if (!val) return false
        if (list) list.remove()
        currentFocus = -1
        list = dom.searchAutocompleteList = document.createElement('div')
        list.setAttribute('class', 'autocomplete-items')
        input.parentNode.appendChild(list)
        items.forEach(item => {
            /*check if the item starts with the same letters as the text field value:*/
            if (item.substr(0, val.length).toUpperCase() !== val.toUpperCase()) return // fixme substr
            /*create a DIV element for each matching element:*/
            const itemEl = document.createElement('div')
            /*make the matching letters bold:*/
            itemEl.innerHTML = `<strong>${item.substr(0, val.length)}</strong>${item.substr(val.length)}` // fixme substr
            /*insert a input field that will hold the current array item's value:*/
            itemEl.innerHTML += `<input type="hidden" value="${item}">`
            itemEl.addEventListener('click', () => {
                input.value = item
                findAndFocus(diagram, item)
                list.remove()
            })
            itemEl.style.height = '20px'
            itemEl.style.padding = '5px'
            itemEl.style.fontSize = '12px'
            itemEl.style.width = '300px'
            list.appendChild(itemEl)
        })
    })
    /*execute a function presses a key on the keyboard:*/
    input.addEventListener('keydown', e => {
        let items = list ? list.querySelectorAll('div') : null

        if (e.keyCode === 40) { // down
            removeActive(items)
            currentFocus++
            setActive(items)
        } else if (e.keyCode === 38) { // up
            removeActive(items)
            currentFocus--
            setActive(items)
        } else if (e.keyCode === 13) { // enter
            e.preventDefault() // stops form from submitting

            let exactMatch = findAndFocus(diagram, input.value)
            if (!exactMatch) {
                if (currentFocus > -1 && items.length > currentFocus) {
                    items[currentFocus].click()
                    // simulate a click on the 'active' item if any
                } else if (!exactMatch && items.length > 0) {
                    // or on the first element in the list
                    items[0].click()
                }
            }
        }
    })

    // close the list when clicking outside of it
    registerDocumentEventListener(diagram, 'click', e => {
        if (list && list !== e.target) {
            list.remove()
        }
    })
}

export const SearchForm = {
    search,
    autocompleteSetup,
}
