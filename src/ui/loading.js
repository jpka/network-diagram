'use strict'

export const Loading = {
    start ({ dom }) {
        dom.spinner = dom.container.append('rect').attr('class', 'loader')
    },
    finish ({ dom }) {
        dom.spinner.remove()
    },
}
