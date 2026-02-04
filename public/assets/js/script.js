const { reactive } = Vue
const psState = reactive({ selMain: '', sub: [], selSub: '', selPage: '' })

function switchTab(tab) {
    if (this.tabs[tab.name][tab.idx]) {
        this.tabs[tab.name + 'Tab'] = tab.idx
        return true
    }
    return false
}

function openWindow(url, w, h, target) {
    // Fixes dual-screen position                         Most browsers      Firefox
    const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : screen.left,
        dualScreenTop = window.screenTop !== undefined ? window.screenTop : screen.top

    width = window.innerWidth
        ? window.innerWidth
        : document.documentElement.clientWidth
            ? document.documentElement.clientWidth
            : screen.width
    height = window.innerHeight
        ? window.innerHeight
        : document.documentElement.clientHeight
            ? document.documentElement.clientHeight
            : screen.height

    const left = ((width / 2) - (w / 2)) + dualScreenLeft,
        top = ((height / 2) - (h / 2)) + dualScreenTop,
        newWindow = window.open(url, target || 'ID820767', `resizable, scrollbars=yes, width=${w}, height=${h}, top=${top}, left=${left}`)

    // Puts focus on the newWindow
    if (window.focus && newWindow) {
        newWindow.focus()
    }

    return newWindow
}

// count scale graph values for human
const units = ['', 'K', 'M', 'G', 'T', 'P', 'E']

/**
 * count value scale degree
 * @param {number} v
 * @returns {number}
 */
function scaleValue(v) {
    let scale = 0
    while ((v > 1000) && (typeof units[scale + 1] !== 'undefined')) {
        scale++
        v /= 1000
    }
    return scale
}

/**
 * prepare value for scaling and units
 * @param {number|number[]} v
 * @returns {{scale: number, units: string}}
 */
function scaleLegend(v) {
    /**
     * @function mean
     * @param {number[]} values
     * @return number
     */
    function mean (values) {
        return values.reduce((acc, cur) => acc + cur, 0) / values.length
    }

    const scale = Array.isArray(v)
        ? Math.floor(mean(v.map(scaleValue)))
        : (typeof v === 'number')
            ? scaleValue(v)
            : 0

    return {
        scale: scale ? Math.pow(1000, scale) : 1,
        units: units[scale] + 'b'
    }
}

function zxRepaint () {
    // empty no purpose

    // but here is a bunny if you insist


    // (\(\                 \|/
    // ( -.-)               -o-
    // o_(")(")             /|\


    // look at him, just chilling in the sun
}
