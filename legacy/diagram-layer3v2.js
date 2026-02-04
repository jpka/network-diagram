/*global d3, _, visioExport*/
"use strict"

const Diagram = function () {
  // localStorage feature detection
  const hasStorage = (() => {
    let mod = "storage test"
    try {
      localStorage.setItem(mod, mod)
      localStorage.removeItem(mod)
      return true
    } catch (exception) {
      return false
    }
  })()
  let timer = null
  const Utils = {
    getPosition(event) {
      const {layerX: x, layerY: y} = d3.event
      const z = d3.event?.fromElement?.__zoom || d3.event?.fromElement?.farthestViewportElement?.__zoom || {
        k: 1, x: 0, y: 0
      }
      return {x: (x - z.x) / z.k, y: (y - z.y) / z.k}
    },
    inInteractMode() {
      return d3.event.shiftKey || d3.event.sourceEvent?.shiftKey
    },
    findNode({nodes}, value) {
      return nodes.find(node => node.subnet === value || node.name === value || node.ipAddress === value)
    },
    findAndFocus(diagram, value) {
      const node = this.findNode(diagram, value)

      if (!node) {
        return false;
      }
      const layer = diagram.currentLayer;

      if (Number.isInteger(node.group)) {
        // add to opened groups
        const parent = layer.groups[node.group]?.parent
        Opened.value.push(node.group)
        if (parent != null) Opened.value.push(parent)
        Opened.value = [...new Set(Opened.value)]
        Opened.set(diagram)
        Grouping.focus(diagram, layer.groups[node.group]);

        Grouping.update(diagram, diagram.currentLayer)
        Graphics.update(diagram)

        Zoom.focusOnNode(diagram, node);
      } else {
        Zoom.focusOnNode(diagram, node);
      }
      setTimeout(() => Utils.showTooltipAt(diagram, node, Utils.getNodeImageElement(diagram, node.name)), 500);

      return true;
    },
    registerDocumentEventListener({docEventListeners}, type, listener) {
      document.addEventListener(type, listener)
      docEventListeners.push([
        type,
        listener
      ])
    },
    cleanEventListeners({docEventListeners}) {
      docEventListeners.forEach(([type, listener]) => document.removeEventListener(type, listener))
    },
    isWidget() {
      return window.psDashboardWidgetMode
    },
    parseJSON(value) {
      if (typeof value !== "string" || !value?.length) return value
      try {
        return JSON.parse(value)
      } catch (e) {
        console.error(e)
        return false
      }
    },
    getLinkWidth(w) {
      return [
        [10000000, 3],
        [100000000, 4],
        [1000000000, 5],
        [10000000000, 6],
        [25000000000, 7],
        [50000000000, 8],
        [100000000000, 9],
        [Infinity, 10]
      ].find(([limit]) => w < limit)[1]
    },
    getFillColor(status, color = 'transparent') {
      status = status?.toLowerCase()
      return ([
        {status: ['healthy', 'ok'], color: 'green'},
        {status: ['suppressed', 'warning'], color: 'yellow'},
        {status: ['degraded', 'issues'], color: 'red'},
        {status: ['commfailure', 'offline'], color: 'grey'},
        {status: ['down'], color: 'black'},
      ].find((e) => e.status.includes(status)) || {color}).color
    },
    getTooltipTextLines(node) {
      const lines = [];
      if (node.bandwidth || !node.image) {
        lines.push(node.intDescription, node.ipAddress, (node.mask ?? node.target.mask), Data.downScaleBandwidth(node.bandwidth))
        if (node.QoS) lines.push(node.QoS)
      } else {
        if (node.isUnmanaged) {
          lines.push(node.name);
        } else if (node.isCloud) {
          lines.push(`Subnet: ${node.subnet}`, `Mask: ${node.mask}`);
        } else {
          if (node.manufacturer || node.model || node.softwareOS) {
            lines.push(node.ipAddress, node.manufacturer, node.model, node.softwareOS, node.location);
          } else {
            lines.push('n/a');
          }
        }
      }

      return lines;
    },
    getNodeImageElement({graphics}, name) {
      return graphics.nodes._groups[0].filter(p => p.__data__.name === name)[0].children[1]
    },
    addTooltip(svg) {
      const x = (t) => {
        let result = 0
        if (t === 'subnet') return -70
        if (t === 'device') return 25
        return result
      }

      const y = (t) => {
        let result = 0
        if (t === 'subnet') return 30
        if (t === 'device') return -15
        return result
      }
      svg.append('foreignObject')
        .each(function (node) {
          const type = node.bandwidth ? 'link' : (node.isCloud ? 'subnet' : 'device');
          const lines = Utils.getTooltipTextLines(node);
          const fo = d3.select(this)
          fo
            .attr('class', 'svg-tooltip')

          const div = fo.append('xhtml:div')
            .attr('class', `tooltip ${type === 'subnet' ? 'down-tip' : 'right-tip'}`)

          lines.forEach(line => {
            div.append('p')
              .attr('class', 'tooltip-text-line')
              .html(line);
          })

          fo
            .attr('x', x(type))
            .attr('y', y(type))
        })
    }, // node: data object to get text, target: attach location
    showTooltipAt(diagram, node, target, pos) {
      const type = node.bandwidth || !node.image ? 'link' : (node.isCloud ? 'subnet' : 'device');
      const lines = Utils.getTooltipTextLines(node);
      const attr = target.attributes
      const {x: foX, y: foY, width: foWidth, height: foHeight} = target.getBoundingClientRect()
      let w = 50, h = 50
      const scale = (diagram.dom.svg._groups[0][0]?.__zoom?.k || 1) * .8
      const g = diagram.dom.svg.select('g')
        .append('g')
        .attr('class', 'g-tooltip')
        .attr('transform', `scale(${1 / scale})`)
      if (type !== 'link') {
        const groups = document.querySelectorAll(`g[index="${attr.index.nodeValue}"]`)
        const group = groups[groups.length - 1]
        const transform = group?.getAttribute('transform')
        const image = group?.querySelector('image')
        w = image?.getAttribute('width')
        h = image?.getAttribute('height')
        g
          .attr('transform', `${transform} scale(${1 / scale})`)
      }
      const fo = g.append('foreignObject')
        .attr('class', 'svg-tooltip')

      const div = fo.append('xhtml:div')
        .attr('class', `tooltip`)

      lines.forEach(line => {
        div.append('p')
          .attr('class', 'tooltip-text-line')
          .html(line);
      })

      const tipDivWidth = div._groups[0][0].clientWidth;
      const tipDivHeight = div._groups[0][0].clientHeight;

      const overflowRight = foX + foWidth + tipDivWidth > window.innerWidth
      const overflowDown = foY + foHeight + tipDivHeight > window.innerHeight

      if (type === 'device') {
        div
          .attr('class', `tooltip ${overflowRight ? 'left-tip' : 'right-tip'}`)
        fo
          .attr('x', (overflowRight ? -(tipDivWidth + (w / 2) * scale) : (w / 2 - 5) * scale))
          .attr('y', -tipDivHeight / 2)
      } else if (type === 'subnet') {
        div
          .attr('class', `tooltip ${overflowDown ? 'up-tip' : 'down-tip'}`)
        fo
          .attr('x', -tipDivWidth / 2)
          .attr('y', overflowDown ? (-tipDivHeight - (h / 2 - 10) * scale) : (h / 2 - 15) * scale)
      } else if (type === 'link') {
        let leftTip = overflowRight
        const x1 = attr.x1.nodeValue * 1
        const y1 = attr.y1.nodeValue * 1
        const isDrillDown = !!document.querySelector('.-drill-down-')
        const id = document.querySelector(`g[transform="translate(${x1}, ${y1})"]`)?.getAttribute('group')
        if (isDrillDown || (id && Opened.value.includes(id * 1))) {
          const x2 = attr.x2.nodeValue * 1
          const y2 = attr.y2.nodeValue * 1
          leftTip = (x1 > x2)
          const downTip = (y1 > y2)
          const angle = Math.atan(Math.abs(y2 - y1) / Math.abs(x2 - x1))
          const offsetX = 30 * Math.cos(angle) * scale
          const offsetY = 30 * Math.sin(angle) * scale
          div
            .attr('class', `tooltip ${leftTip ? 'left-tip-line' : 'right-tip-line'}`)
          fo
            .attr('x', x1 * scale - (leftTip ? tipDivWidth + offsetX + 10 : -offsetX))
            .attr('y', y1 * scale - (downTip ? offsetY : -offsetY) - tipDivHeight / 4)
        } else {
          div
            .attr('class', `tooltip ${leftTip ? 'left-tip' : 'right-tip'}`)
          fo
            .attr('x', (pos?.x || 0) * scale - (leftTip ? tipDivWidth + 5 : 0))
            .attr('y', (pos?.y || 0) * scale - tipDivHeight / 2)
        }
      }
    },
    clearTooltips(dom) {
      dom.svg.selectAll('.g-tooltip')
        .transition()
        .duration(200)
        .remove();
    },
  }

  // -- storage --
  const Store = {
    keyPrefix: "diagrams",
    key({id}, path) {
      return `${this.keyPrefix}.${id}.${path}`
    },
    set(diagram, key, value) {
      if (!hasStorage) return false
      localStorage.setItem(this.key(diagram, key), value)
      return true
    },
    get(diagram, key) {
      if (!hasStorage) return null
      return localStorage.getItem(this.key(diagram, key))
    },
    getParsed(diagram, key) {
      return Utils.parseJSON(this.get(diagram, key))
    },
    remove(diagram, key) {
      if (!hasStorage) return false
      localStorage.removeItem(this.key(diagram, key))
    }
  }

  const Layout = {
    storageKey: "layout",
    get(diagram, layer) {
      const {settings} = diagram

      if (!layer) layer = diagram.currentLayer

      if (!diagram.layout) {
        diagram.layout = Utils.parseJSON(settings.layout ?? Store.get(diagram, this.storageKey)) ?? {}
      }
      return Utils.parseJSON(diagram.layout[layer?.id] ?? '')
    },
    center(diagram, layer) {
      const layerContainer = layer.dom.svg.node();
      const size = layer.nodes.reduce((o, v) => {
        o.min = Math.min(o.min, v.y)
        o.max = Math.max(o.max, v.y)
        o.height = Math.abs(o.min) + Math.abs(o.max) + 280
        o.minX = Math.min(o.minX, v.x)
        o.maxX = Math.max(o.maxX, v.x)
        o.width = Math.abs(o.minX) + Math.abs(o.maxX) + 120
        return o
      }, {min: 0, max: 0, minX: 0, maxX: 0, height: 0, width: 0})
      const k = Math.min(layerContainer.clientHeight / size.height, layerContainer.clientHeight / size.height)
      layer.dom.svg.call(diagram.zoomBehavior.transform, d3.zoomIdentity.translate(
        Math.abs(size.minX) * k + (layerContainer.clientWidth - size.width * k) / 2,
        (Math.abs(size.min) + 60) * k + (layerContainer.clientHeight - (size.height - 60) * k) / 2
      )
        .scale(k))
    },
    restore(diagram, layer) {
      const {nodes, groups} = diagram, layout = this.get(diagram)
      const getNodes = (source, target) => {
        source.forEach(s => target.forEach(t => s.name === t.name ? Object.assign(t, s) : null))
        return target
      }

      if (!layout) return
      // check stored layout nodes and current nodes
      if (layout.nodes) {
        getNodes(layout.nodes, nodes)
        // layout.nodes.forEach(storedNode => {
        //   nodes.forEach(node => {
        //     // and for each match restore their fixed positions
        //     if (storedNode.name === node.name) {
        //       // node.fx = storedNode.fx
        //       // node.fy = storedNode.fy
        //       Object.assign(node, storedNode)
        //     }
        //   })
        // })
      }

      // check stored layout groups and current groups
      if (layout.groups) {
        layout.groups.forEach(storedGroup => {
          groups.forEach(group => {
            // and for each match restore their fixed positions
            if (storedGroup.name === group.name) {
              const nodes = JSON.parse(JSON.stringify(group.nodes))
              Object.assign(group, storedGroup)
              group.nodes = getNodes(group.nodes, nodes)

              // group.fx = storedGroup.fx
              // group.fy = storedGroup.fy
              // group.width = storedGroup.width
              // group.height = storedGroup.height
            }
          })
        })
      }
      Graphics.update(layer)
    },
    clear(diagram) {
      Store.remove(diagram, this.storageKey)
      Store.remove(diagram, 'opened')
    },
    save: _.debounce(function (diagram) {

      const dataNodes = (nodes) =>  nodes?.map(({name, x, y}) => ({name, x, y}))
      const dataGroups = (groups) => groups?.map(({name, x, y, height, width, nodes}) => ({
        name, x, y, height, width, nodes: dataNodes(nodes)
      }))
      const {nodes, groups, currentLayer} = diagram,
        newLayout = JSON.stringify({nodes: dataNodes(nodes), groups: dataGroups(groups)})

      if (diagram.layout[currentLayer.id] !== newLayout) {
        diagram.layout[currentLayer.id] = newLayout
        Store.set(diagram, this.storageKey, JSON.stringify(diagram.layout))
      }
    }, 1000)
  }

  const Zoom = {
    timeStamp: 0,
    async focus({dom, zoomBehavior}, {x, y, scale = 1, duration = 250}) {
      const svgEl = dom.svg.node()
      dom.svg
        .transition()
        .duration(duration)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(svgEl.clientWidth / 2 - x * scale, svgEl.clientHeight / 2 - y * scale)
          .scale(scale))
      return new Promise(resolve => setTimeout(resolve, duration + 100))
    },
    async focusOnNode(diagram, node, scale, duration) {
      // node.fx = node.x
      // node.fy = node.y
      Simulations.stop(diagram)
      return this.focus(diagram, {x: node.x, y: node.y, scale, duration})
    },
    async focusOnArea(diagram, {cx, cy, width, height}, duration) {
      const {dom} = diagram, svgEl = dom.svg.node(),
        scale = 0.9 / Math.max(width / svgEl.clientWidth, height / svgEl.clientHeight)
      return this.focus(diagram, {x: cx, y: cy, scale, duration})
    },
    scale(layer, by) {
      let {zoomBehavior, dom, focusedGroup} = layer;
      //-- if (focusedGroup > -1) return
      zoomBehavior.scaleBy(dom.svg.transition().duration(100), by)
    },
    increment(layer) {
      this.scale(layer, layer.settings.zoomInMult)
    },
    decrement(layer) {
      this.scale(layer, layer.settings.zoomOutMult)
    },
    onWheelScroll(layer) {
      return function (event) {
        const {focusedGroup, settings} = layer
        let delta, scale = 1

        // if a group is focused don't zoom
        //-- if (focusedGroup > -1) return

        if (event.wheelDelta) {
          delta = event.wheelDelta
        } else {
          delta = -1 * event.deltaY
        }
        if (event.timeStamp - Zoom.timeStamp < 100) scale = scale * 1.5
        Zoom.timeStamp = event.timeStamp
        Zoom.scale(layer, delta > 0 ? settings.zoomInMult * scale : settings.zoomOutMult / scale)
      }
    },
    transform: {
      storageKey: "transform", // debounced to avoid storing in localStorage multiple times during zoom or other events
      save: _.debounce(function (diagram, value) {
        const key = this.storageKey
        Store.set(diagram, key, JSON.stringify(value))
      }, 1000),
      clear(diagram) {
        Store.remove(diagram, this.storageKey)
      },
      get(diagram) {
        const {dom, settings} = diagram
        const key = this.storageKey
        // return either the provided value, the stored transform or the default one
        return Utils.parseJSON(settings.transform) ?? Store.getParsed(diagram, key) ?? {
          x: dom.svg.node().clientWidth / 2,
          y: dom.svg.node().clientHeight / 2,
          k: 0.1
        }
      },
    },
    applySettings({settings, zoomBehavior}) {
      zoomBehavior.scaleExtent([settings.maxZoomOut, settings.maxZoomIn])
    },
    restrictArea({zoomBehavior, transform, dom}, area) {
      if (!area) {
        const svgEl = dom.svg.node(), wiggleRoom = 0

        if (!transform) transform = {x: 0, y: 0, k: 1}
        area = [
          [
            (-transform.x - wiggleRoom) / transform.k,
            (-transform.y - wiggleRoom) / transform.k
          ],
          [
            (-transform.x + svgEl.clientWidth + (wiggleRoom)) / transform.k,
            (-transform.y + svgEl.clientHeight + (wiggleRoom)) / transform.k
          ]
        ]
      }
      return zoomBehavior.translateExtent(area)
    },
    clear(diagram) {
      this.transform.clear(diagram)
    },
    async restore(diagram, layer, isHistoryBack) {
      const transform = this.transform.get(diagram)
      // restore saved transform or set the default one
      if (isHistoryBack && !Opened.value.length && Layout.get(diagram)) {
        const layerContainer = layer.dom.svg.node();
        Layout.center(diagram,layer)
      } else {
        layer.dom.svg.call(diagram.zoomBehavior.transform, d3.zoomIdentity.translate(transform.x, transform.y)
          .scale(transform.k))
      }
    },
    init(diagram, layer) {
      const {dom, focusedGroup} = layer

      layer.zoomBehavior = d3.zoom()
        .on("zoom", () => {
          // don't zoom if a group is focused
          //-- if (focusedGroup > -1 && d3.event.sourceEvent && d3.event.sourceEvent.type === "mousemove") return
          layer.transform = d3.event.transform
          dom.layerContainer.attr("transform", d3.event.transform)
        })
        .on("end", () => {
          // save only when on main layer
          if (diagram.layers.length === 1) {
            this.transform.save(diagram, d3.event.transform)
          }
        })
      this.applySettings(diagram)

      dom.svg.call(layer.zoomBehavior)
        .on("wheel.zoom", null)
        .on("dblclick.zoom", null)
      dom.svg.node().addEventListener("wheel", this.onWheelScroll(layer))
    }
  }

  const Grouping = {
    toggle(diagram) {
      const {settings, nodes, simulations, groups} = diagram
      if (!groups) return

      settings.grouping = !settings.grouping

      nodes.forEach(node => {
        const nodePx = node.px, nodePy = node.py
        node.px = node.x
        node.py = node.y
        if (nodePx != null) {
          node.x = nodePx
          node.y = nodePy
        }
      })

      const pAlpha = simulations.nodes.pAlpha, pGroupAlpha = simulations.groups.pAlpha
      simulations.nodes.pAlpha = simulations.nodes.alpha()
      simulations.groups.pAlpha = simulations.groups.alpha()

      if (pAlpha != null) {
        simulations.nodes.alpha(pAlpha)
        simulations.groups.alpha(pGroupAlpha)
      } else {
        simulations.nodes.alpha(1)
        simulations.groups.alpha(1)
      }

      this.setup(diagram)

      if (settings.grouping) simulations.groups.alphaTarget(0).restart()
      simulations.nodes.alphaTarget(0).restart()

      Store.set(diagram, "grouping", settings.grouping.toString())
    },
    update(diagram, layer) {
      const {settings} = diagram, {groups, nodes, focusedGroup} = layer

      if (!settings.grouping || !groups) return

      let updateGroups = groups
      if (focusedGroup > -1) {
        updateGroups = [groups[focusedGroup]]
      }

      updateGroups.forEach(group => {

        if (!nodes.length) return null

        const childGroups = groups.filter(n => n.parent === group.index);

        const groupNodes = nodes
          .filter(n => n.group === group.index || childGroups.find(cgroup => cgroup.index === n.group))

        if (group.isEmpty || !groupNodes.length) {
          group.height = group.height || 180
          group.width = Math.max(180, group.width || group.name.length * 22)
          return null
        }


        let coords = groupNodes.reduce((acc, d) => {
          const childPadding = childGroups.find(cgroup => cgroup.index === d.group) ? settings.groupPadding : 0
          return {
            x: [
              Math.min(acc.x[0], d.x - childPadding),
              Math.max(acc.x[1], d.x + childPadding)
            ],
            y: [
              Math.min(acc.y[0], d.y - childPadding),
              Math.max(acc.y[1], d.y + childPadding)
            ],
          }
        }, {
          x: [groupNodes[0].x, groupNodes[0].x],
          y: [groupNodes[0].y, groupNodes[0].y]
        })
        coords.x[0] -= settings.groupPadding
        coords.x[1] += settings.groupPadding
        coords.y[0] -= settings.groupPadding
        coords.y[1] += settings.groupPadding

        // group holds content nodes and child groups if not locked
        if (!group.fx) {
          Object.assign(group, {
            x: coords.x[0],
            y: coords.y[0],
            width: coords.x[1] - coords.x[0],
            height: coords.y[1] - coords.y[0],
          })
        }

        // cx, cy is used in cluster force of nodes
        if (group.width && group.height) {
          group.cx = group.x + group.width / 2
          group.cy = group.y + group.height / 2
        }

        // bounding child groups
        if (Number.isInteger(group.parent)) {
          const curParentGroup = groups[group.parent];
          if (Number.isInteger(group.parent) && curParentGroup.fx && curParentGroup.width && curParentGroup.height && curParentGroup.x && curParentGroup.y) {
            group.x = Math.max(curParentGroup.x + settings.groupPadding, Math.min(curParentGroup.x + curParentGroup.width - settings.groupPadding - group.width, group.x));
            group.y = Math.max(curParentGroup.y + settings.groupPadding, Math.min(curParentGroup.y + curParentGroup.height - settings.groupPadding - group.height, group.y));
          }
        }
      })

      // group bounding solution by tick
      // bounding content nodes
      for (var i = 0, n = nodes.length; i < n; ++i) {
        const curNode = nodes[i];
        const curGroup = groups[curNode.group];
        const {x, y, width, height} = curGroup || {}
        if (Number.isInteger(curNode.group) && width && height && x && y) {
          curNode.x = Math.max(x + settings.groupPadding, Math.min(x + width - settings.groupPadding, curNode.x));
          curNode.y = Math.max(y + settings.groupPadding, Math.min(y + height - settings.groupPadding, curNode.y));
          if (groups[curGroup.parent]) {
            const {x, y, width, height} = groups[curGroup.parent]
            curNode.x = Math.min(Math.max(curNode.x, x + 2 * settings.groupPadding), x + width - 2 * settings.groupPadding)
            curNode.y = Math.min(Math.max(curNode.y, y + 2 * settings.groupPadding), y + height - 2 * settings.groupPadding)
          }
        }
      }

    },
    focus(diagram, group) {
      if (!Opened.value.includes(group.id)) {
        Opened.value.push(group.id)
        Opened.set(diagram)
      }
      // Grouping.unfocus(diagram)
      diagram.focusedGroup = group.id

      Zoom.focusOnArea(diagram, group)
      // Grouping.update(diagram, diagram.currentLayer)
      // Graphics.update(diagram)
    },
    unfocus(layer, targetZoom) {
      const {focusedGroup, dom, zoomBehavior} = layer

      if (focusedGroup < 0) return
      if (targetZoom) {
        dom.svg
          .transition()
          .call(zoomBehavior.scaleTo, targetZoom.k)
      }

      layer.focusedGroup = -1
    }
  }

  const IpAddress = {
    init(diagram, layer) {
      layer.dom.svg.selectAll('text')
        .each(function (d) {
          if (d?.isDevice) {
            const existingText = d3.select(this)
            if (existingText.text() === "?") return
            const bbox = existingText.node().getBBox();

            const newX = bbox.x;
            const newY = bbox.y + bbox.height + 15;

            let newText = d3.select(this.parentNode)
              .append('text')
              .text(d.ipAddress)
              .attr("text-anchor", "middle")
              // .attr('x', newX)
              .attr('y', -30)
              .attr('font-size', '16px')
              .attr('class', 'ip-address');

            const newTextWidth = newText.node().getBBox().width;
            newText.attr('x', newX + (bbox.width - newTextWidth) / 2);
            newText.style('visibility', diagram.settings.showIpAddress ? 'visible' : 'hidden');
          }
        });
    },

    toggle(diagram) {
      const {settings} = diagram

      let layer = diagram.layers[0].dom.svg;
      settings.showIpAddress = !settings.showIpAddress;

      // layer.selectAll('.ip-address')
      //   .style('visibility', diagram.settings.showIpAddress ? 'visible' : 'hidden');
      document
        .querySelectorAll('.ip-address')
        .forEach(e => e.style = `visibility:${diagram.settings.showIpAddress ? 'visible' : 'hidden'};`)

      Store.set(diagram, "showIpAddress", settings.showIpAddress.toString())
    }
  };

  const Simulations = {
    isDrag: false,
    forces: {
      cluster({settings, groups}) {
        const strength = 0.2
        let nodes

        function force(alpha) {
          if (!settings.grouping || !groups || groups.length === 0) return
          const l = alpha * strength
          for (const d of nodes) {
            const {cx, cy} = (groups[d.group] || {cx: 0, cy: 0})
            if (cx && cy) {
              d.vx -= (d.x - cx) * l
              d.vy -= (d.y - cy) * l
            }
          }
        }

        force.initialize = _ => nodes = _

        return force
      }, // group bounding solution by force
      bounding({settings, groups}) {
        const strength = 0.2
        const radius = 20;
        let nodes

        function force(alpha) {
          if (!groups) return;

          for (var i = 0, n = nodes.length; i < n; ++i) {
            const curNode = nodes[i];
            const curGroup = groups[curNode.group];
            const {x, y, width, height} = curGroup || {}
            if (curGroup && curGroup.fx && width && height && x && y) {
              curNode.x = Math.max(x + radius, Math.min(x + width - radius, curNode.x));
              curNode.y = Math.max(y + radius, Math.min(y + height - radius, curNode.y));
            }
          }
        }

        force.initialize = _ => nodes = _

        return force
      },
      rectCollide(diagram) {
        function constant(_) {
          return function () {
            return _
          }
        }

        let nodes
        let size = constant([0, 0])
        let iterations = 1
        let strength = 1
        const padding = 100

        function sizes(i) {
          const n = nodes[i]
          return [n.width ? n.width : 80, n.height ? n.height : 80]
        }

        function masses(i) {
          const s = sizes(i)
          return s[0] * s[1]
        }

        function force() {
          var node, size, mass, xi, yi
          var i = -1
          while (++i < iterations) {
            iterate()
          }

          function iterate() {
            var j = -1
            var tree = d3.quadtree(nodes, xCenter, yCenter).visitAfter(prepare)

            while (++j < nodes.length) {
              node = nodes[j]
              size = sizes(j)
              mass = masses(j)
              xi = xCenter(node)
              yi = yCenter(node)

              tree.visit(apply)
            }
          }

          function apply(quad, x0, y0, x1, y1) {
            var data = quad.data
            var xSize = ((size[0] + quad.size[0]) / 2) + padding
            var ySize = ((size[1] + quad.size[1]) / 2) + padding
            let strength = 1
            if (data) {
              if (data.index <= node.index || data.parent === node.index || data.index === node.parent) {
                return
              }

              var x = xi - xCenter(data)
              var y = yi - yCenter(data)
              var xd = Math.abs(x) - xSize
              var yd = Math.abs(y) - ySize

              if (xd < 0 && yd < 0) {
                var l = Math.sqrt(x * x + y * y)
                var m = masses(data.index) / (mass + masses(data.index))

                if (Math.abs(xd) < Math.abs(yd)) {
                  let xDiff = (x *= xd / l * strength) * m

                  if (data.isCloud) {
                    data.vx += x * (1 - m)
                  } else {
                    nodes.forEach(group => {
                      if (group.parent === node.index) {
                        group.nodes.forEach(n => {
                          n.vx -= xDiff
                        })
                      }
                    })
                    node.nodes.forEach(n => {
                      n.vx -= xDiff
                    })

                    nodes.forEach(group => {
                      if (group.parent === data.index) {
                        group.nodes.forEach(n => {
                          n.vx += x * (1 - m)
                        })
                      }
                    })
                    data.nodes.forEach(n => {
                      n.vx += x * (1 - m)
                    })
                  }
                } else {
                  let yDiff = (y *= yd / l * strength) * m

                  if (data.isCloud) {
                    data.vy += y * (1 - m)
                  } else {
                    nodes.forEach(group => {
                      if (group.parent === node.index) {
                        group.nodes.forEach(n => {
                          n.vy -= yDiff
                        })
                      }
                    })
                    node.nodes.forEach(n => {
                      n.vy -= yDiff
                    })

                    nodes.forEach(group => {
                      if (group.parent === data.index) {
                        group.nodes.forEach(n => {
                          n.vy += y * (1 - m)
                        })
                      }
                    })
                    data.nodes.forEach(n => {
                      n.vy += y * (1 - m)
                    })
                  }
                }
              }
            }

            let collide = x0 > xi + xSize || y0 > yi + ySize || x1 < xi - xSize || y1 < yi - ySize

            return collide
          }

          function prepare(quad) {
            if (quad.data) {
              quad.size = sizes(quad.data.index)
            } else {
              quad.size = [
                0,
                0
              ]
              var i = -1
              while (++i < 4) {
                if (quad[i] && quad[i].size) {
                  quad.size[0] = Math.max(quad.size[0], quad[i].size[0])
                  quad.size[1] = Math.max(quad.size[1], quad[i].size[1])
                }
              }
            }
          }
        }

        function xCenter(d) {
          return d.x + d.vx + sizes(d.index)[0] / 2
        }

        function yCenter(d) {
          return d.y + d.vy + sizes(d.index)[1] / 2
        }

        force.initialize = function (_) {
          nodes = _
        }

        force.size = function (_) {
          return (arguments.length ? (size = typeof _ === "function" ? _ : constant(_), force) : size)
        }

        force.strength = function (_) {
          return (arguments.length ? (strength = +_, force) : strength)
        }

        force.iterations = function (_) {
          return (arguments.length ? (iterations = +_, force) : iterations)
        }

        return force
      },
    },
    nodes: {
      isUpdating: false,
      create(diagram, layer) {
        const {settings} = diagram, {
          nodes,
          edges,
          groups
        } = layer

        return d3.forceSimulation()
          .nodes(nodes)
          .force("x", d3.forceX().strength(0.1))
          .force("y", d3.forceY().strength(0.1))
          .force("link", d3.forceLink(edges).id(d => d.name).strength(link => {
            if (link.trunkOffset != null) return .05
            // we differentiate between same and not same group links and parent/child group links
            if (link.source.group === link.target.group) {
              return 0.3
            } else if (groups && Number.isInteger(link.target.group) && Number.isInteger(link.source.group) && (groups[link.source.group].parent === link.target.group || groups[link.target.group].parent === link.source.group)) {
              return 0.4
            } else {
              return 0.09
            }
          }))
          .force("cluster", Simulations.forces.cluster(diagram))
          // .force("bounding", Simulations.forces.bounding(diagram))
          .force("charge", d3.forceManyBody().strength(-3000))
          .alpha(Layout.get(diagram) ? .005 : 1)
          .alphaTarget(0)
          .on("tick", function () {
            // console.log('tick')
            Simulations.nodes.isUpdating = true
            Grouping.update(diagram, layer)
            Graphics.update(layer)
          })
          .on("end", () => {
            // console.log('end tick Simulations nodes')
            Simulations.nodes.isUpdating = false
            Layout.save(diagram)
          })
      },
    },
    groups: {
      create(diagram, layer) {
        const {
          groups,
          nodes
        } = layer

        // group content nodes, will be used in rect collide force
        groups.forEach((group => {
          group.nodes = diagram.graphics.nodes
            .filter(d => d.group === group.id)
            .data()
        }))
        return d3.forceSimulation()
          .nodes(groups.concat(nodes.filter(n => !Number.isInteger(n.group))))
          .alpha(Layout.get(diagram) ? .001 : 1)
          .alphaTarget(0)
          .force("collision", Simulations.forces.rectCollide())
        // .on("tick",()=>{
        //   console.log('tick groups')
        // })
        // .on("end",()=>{
        //   console.log('tick groups end')
        // })
      }
    },
    drag(diagram, layer) {

      function dragstarted(d) {
        Graphics.mouseStartPosition = {x: d.x, y: d.y}
        const {
          simulations,
          settings
        } = diagram
        if (Utils.inInteractMode()) return null

        if (!d3.event.active) {
          simulations.nodes.alphaTarget(0.0).restart()
          if (settings.grouping && simulations.groups) {
            simulations.groups.alphaTarget(0.0).restart()
          }
        }

        d.fx = d.x
        d.fy = d.y
      }

      function dragged(d) {
        const {
          simulations,
          settings
        } = diagram
        if (Utils.inInteractMode()) return null

        d.fx = d3.event.x
        d.fy = d3.event.y
        if (!Simulations.isDrag) {
          Simulations.isDrag = true
          simulations.nodes.alphaTarget(0.3).restart()
          if (settings.grouping && simulations.groups) {
            simulations.groups.alphaTarget(0.3).restart()
          }
        }
      }

      function dragended(d) {
        Simulations.isDrag = false
        if (Utils.inInteractMode()) return null
        const {
          groups,
          simulations,
          settings
        } = diagram, group = groups ? groups[d.group] : null

        if (!d3.event.active) {
          if (simulations.groups) simulations.groups.alphaTarget(0)
          simulations.nodes.alphaTarget(0)
        }

        if (groups) Grouping.update(diagram, layer)

        if (settings.floatMode) {
          d.fx = null
          d.fy = null
        }
        if(d.x === Graphics.mouseStartPosition.x && d.y === Graphics.mouseStartPosition.y) return
        Layout.save(diagram)
      }

      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    },
    init(diagram) {
      const layer = diagram.layers[0]

      layer.simulations = {
        nodes: Simulations.nodes.create(diagram, layer)
      }
      if (layer.groups && layer.groups.length > 0) layer.simulations.groups = Simulations.groups.create(diagram, layer)
    },
    teardown({simulations}) {
      Object.keys(simulations).forEach(key => {
        simulations[key].stop()
        delete simulations[key]
      })
    },
    stop({simulations}) {
      if (simulations) Object.values(simulations).forEach(simulation => simulation.stop())
    }
  }
  const Opened = {
    storageKey: "opened",
    value: [],
    get(diagram) {
      return Utils.parseJSON(Store.get(diagram, this.storageKey)) || []
    },
    set(diagram) {
      Store.set(diagram, this.storageKey, JSON.stringify(Opened.value))
    },
  }
  const Graphics = {
    isDrag: false,
    mouseStartPosition: {x: 0, y: 0},
    isChild({groups, focusedGroup, id}) {
      return id === focusedGroup || groups.find(cg => cg.id === focusedGroup && cg.parent === id)
    },
    skipDrag(layer, p) {
      return Utils.inInteractMode()  // || (layer.focusedGroup !== -1) && (layer.groups[p.id]?.parent !== layer.focusedGroup)
    },
    drag(diagram, layer, graphics) {
      const {settings} = diagram
      let dragStart = {}, expRight = true, expDown = true;
      return d3.drag()
        .on("start", (p) => {
          Graphics.mouseStartPosition = {x: p.x, y: p.y}
          if (Graphics.skipDrag(layer, p)) return null
          if (!d3.event.active && layer.simulations) {
            layer.simulations.nodes.alphaTarget(0).restart()
            layer.simulations.groups.alphaTarget(0).restart()
          }

          dragStart.x = d3.event.x
          dragStart.y = d3.event.y

          const clickPos = d3.event.sourceEvent.target.getBoundingClientRect()

          expRight = d3.event.sourceEvent.clientX > clickPos.x + clickPos.width / 2;
          expDown = d3.event.sourceEvent.clientY > clickPos.y + clickPos.height / 2;

          graphics.nodes.filter(d => d.group === p.id).each(d => {
            // needs to back up locked nodes' fx, fy and restore at end
            d.ox = d.fx
            d.oy = d.fy

            d.fx = d.sx = d.x
            d.fy = d.sy = d.y
          })

          p.sx = p.x
          p.sy = p.y
          p.swidth = p.width
          p.sheight = p.height

        })
        .on("drag", (p) => {
          if (Graphics.skipDrag(layer, p)) return null
          if (layer.focusedGroup === p.id) {
            // resizing
            p.fx = p.sx + (expRight ? 0 : d3.event.x - dragStart.x)
            p.fy = p.sy + (expDown ? 0 : d3.event.y - dragStart.y)

            p.width = p.swidth + (expRight ? -dragStart.x + d3.event.x : dragStart.x - d3.event.x)
            p.height = p.sheight + (expDown ? -dragStart.y + d3.event.y : dragStart.y - d3.event.y)

            Grouping.update(diagram, layer)
          } else {
            // moving
            graphics.nodes.filter(d => d.group === p.id).each(d => {
              d.fx = d.sx - dragStart.x + d3.event.x
              d.fy = d.sy - dragStart.y + d3.event.y
            })
            let fx = p.sx - dragStart.x + d3.event.x
            let fy = p.sy - dragStart.y + d3.event.y

            p.fx = fx
            p.fy = fy

            p.width = p.swidth
            p.height = p.sheight
          }
          if (!Graphics.isDrag && layer.simulations) {
            Graphics.isDrag = true
            layer.simulations.nodes.alphaTarget(0.1).restart()
            layer.simulations.groups.alphaTarget(0.1).restart()
          }
        })
        .on("end", (p) => {
          Graphics.isDrag = false
          if (Graphics.skipDrag(layer, p)) return null

          if (!d3.event.active && layer.simulations) {
            layer.simulations.groups.alphaTarget(0)
            layer.simulations.nodes.alphaTarget(0)
          }
          Grouping.update(diagram, layer)

          if (settings.floatMode) {
            p.fx = null
            p.fy = null
          }
          graphics.nodes.filter(d => d.group === p.id).each(d => {
            if (d.ox && d.oy) {
              d.fx = d.ox - dragStart.x + d3.event.x
              d.fy = d.oy - dragStart.y + d3.event.y
            } else {
              d.fx = null
              d.fy = null
            }
          })
          if(p.x === Graphics.mouseStartPosition.x && p.y === Graphics.mouseStartPosition.y) return
          Layout.save(diagram)
        })
    },
    update({focusedGroup, nodes, groups, graphics, settings}) {
      // console.log('UPDATE', {
      //   focusedGroup, groups, graphics
      // });

      graphics.links
        .each(function(d) {
          const line = d3.select(this)
          let x1 = d.source.x, y1 = d.source.y, x2 = d.target.x, y2 = d.target.y
          if (d.trunk && x1 !== x2 && y1 !== y2) {
            const angle = Math.atan(Math.abs(y2 - y1) / Math.abs(x2 - x1))
            const offsetX = d.trunkOffset * (x1 > x2 ? 1 : -1) * Math.sin(angle)
            const offsetY = d.trunkOffset * (y1 < y2 ? 1 : -1) * Math.cos(angle)
            x1 = x1+offsetX
            x2 = x2+offsetX
            y1 = y1+offsetY
            y2 = y2+offsetY
          }
          line
            .attr("x1", x1)
            .attr("y1", y1)
            .attr("x2", x2)
            .attr("y2", y2)

          const layers = document.querySelectorAll('.grabbable svg')
          if (layers.length) {
            const layer = layers[layers.length - 1]
            const icon = layer.querySelector(`g.line-with-svg-icon[index="${d.index}"]`)
            if (icon) {
              const x = x1 + (x2 - x1) / 2
              const y = y1 + (y2 - y1) / 2
              icon.setAttribute('transform', `translate(${x}, ${y})`)
            }
          }
        })

      graphics.nodes.attr("transform", d => `translate(${d.x}, ${d.y})`)
        .attr('index', (d, i) => i)
        .attr('group', (d) => d.group ?? -1)
        .attr("stroke-width", d => d.fx ? "1px" : "0")
        .style('display', d => !groups || !Number.isInteger(d.group) || Opened.value.includes(d.group) ? 'block' : 'none')

      // no groups in device view, return
      if (!graphics.groups) return;

      graphics.groups
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
        .style('display', d => d.parent == null || Opened.value.includes(d.id) || Opened.value.includes(d.parent) ? 'block' : 'none')

      graphics.groups.select('rect')
        .attr("fill", d => `${Opened.value.includes(d.id) ? 'none' : (d.isEmpty ? "lightgrey" : "#99d9ea")}`)
        .attr("width", d => d.width)
        .attr("height", d => d.height)
        // .attr("stroke-dasharray", d => d.fx && d.id !== focusedGroup ? "20 10" : "0")
        // .style("pointer-events", group => `${group.id === focusedGroup ? 'stroke' : 'all'}`)
        .style("pointer-events", group => `${Opened.value.includes(group.id) ? 'stroke' : 'all'}`)

      graphics.groups.select('image.close-button-image')
        .attr("transform", group => `translate(${(group.width ? group.width : 0) - 20}, ${-10})`)
        .attr("style", group => `display: ${Opened.value.includes(group.id) ? 'block' : 'none'}; cursor: pointer;`)

      graphics.groups.select('text')
        .attr("transform", `translate(${10}, ${40})`)

      graphics.groups.select('image')
        .attr("x", group => (group.width ? group.width : 0) / 2 - 46)
        .attr("y", group => (group.height ? group.height : 0) / 2 - 46)
        .attr("width", 92)
        .attr("height", 92)
        .attr("style", group => `display: ${Opened.value.includes(group.id) ? 'none' : 'block'}`)
    },
    refreshStatus(layer) {
      // line status color and width
      layer.dom.layerContainer.selectAll("line")
        .attr("stroke", d => Utils.getFillColor(d.status, 'black'))
        .attr("stroke-width", d => {
          return d.isStaticWan ? 5 : Utils.getLinkWidth(d.bandwidth)
        })
      // icon at links
      layer.dom.layerContainer.selectAll(".line-with-svg-icon")
        .each(function (d) {
          const color = Utils.getFillColor(d.status, 'black')
          const node = d3.select(this)
          node
            .style("display", ['grey', 'black'].includes(color) ? 'block' : 'none')
            .select('use')
            .attr("xlink:href", `#${color === 'black' ? 'warning' : 'question'}`)
        })
      // circle fill and alert text
      layer.dom.layerContainer.selectAll("g.node")
        .each(function (d, i) {
          const color = Utils.getFillColor(d.status)
          const node = d3.select(this)
          node
            .select('circle')
            .attr("fill", color === 'green' ? 'transparent' : color)
          node
            .select('text.device-alert')
            .remove()
          if (color !== 'grey') return
          node.append("text")
            .attr('index', i)
            .attr('class', 'device-alert')
            .style("font-size", "42px")
            .style("font-weight", "bold")
            .style("fill", "red")
            .style("font-family", "Arial, Helvetica, sans-serif")
            .attr("text-anchor", "middle")
            .attr("dy", 16)
            .text('?')
        })
    },
    async fetchStatus(diagram) {
      if (timer != null) {
        const {devices, links} = await Data.fetch(dataUrl)
        // set news status values
        const nodes = devices
          .filter(e => !e.image?.includes('cloud.png'))
          .map(e => ({id: e.ipAddress, status: e.status}))
        const edges = links
          .map(e => ({id: e.ipAddress, status: e.status}))
        // push new values
        diagram.layers.forEach((layer, i) => {
          nodes.forEach(node => {
            const item = layer.nodes.find(e => e.ipAddress === node.id)
            if (item) item.status = node.status
          })
          edges.forEach(node => {
            const item = layer.edges.find(e => e.ipAddress === node.id)
            if (item) item.status = node.status
          })
          this.refreshStatus(layer)
        })
      }
      timer = setTimeout(() => this.fetchStatus(diagram), timeoutRefresh)
    },
    focus(diagram, d) {
      Grouping.focus(diagram, d)
      Grouping.update(diagram, diagram.currentLayer)
      Graphics.update(diagram)
    },
    unfocus(diagram, d) {
      Grouping.unfocus(diagram, {k: 0.25})
      Grouping.update(diagram, diagram.currentLayer)
      Graphics.update(diagram)
    },
    restore(diagram, layer) {
      if (!Opened.value.length) {
        if (layer) {
          Layout.restore(diagram, layer)
          Zoom.restore(diagram, layer, true)
        }
        return
      }
      const index = Opened.value[Opened.value.length-1]
      const d = diagram.groups[index]
      Graphics.unfocus(diagram, d)
      Graphics.focus(diagram, d)
    },
    create(diagram, layer, first) {
      const graphics = diagram.graphics = {}
      const {dom, edges, nodes, groups, settings} = diagram
      let tooltipHoverDelayTimer = null;

      //controls all link drawing and formatting
      graphics.links = layer.dom.layerContainer.selectAll("line")
        .data(edges)
        .enter().append("line")
        .style("cursor", "default")
        .attr('offset', d => d.trunkOffset)
        .attr('index', (d, i) => i)
        .on("mouseover", d => {
          if (d.QoS || !d.isStaticWan) {
            const targetNode = d3.event.target;
            const position = Utils.getPosition(d3.event)
            const node = JSON.parse(JSON.stringify(d))
            tooltipHoverDelayTimer = setTimeout(() => Utils.showTooltipAt(diagram, node, targetNode, position), 500)
          }
        })
        .on("mouseout", () => {
          clearTimeout(tooltipHoverDelayTimer)
          setTimeout(() => Utils.clearTooltips(dom), 500);

        })
        .on("dblclick", d => {
          window.location.assign(`${apiUrl}?d=${d.dev}&i=${d.int}`)
        })

      layer.dom.layerContainer.selectAll(".line-with-svg-icon")
        .data(edges)
        .enter().append("g")
        .attr("class", "line-with-svg-icon")
        .style("cursor", "default")
        .attr('index', (d, i) => i)
        .each(function (d, i) {
          const node = d3.select(this)
          const status = Utils.getFillColor(d.status, 'black')
          node
            .style("display", ['grey', 'black'].includes(status) ? 'block' : 'none')
            .append("use")
            .attr("xlink:href", `#${status === 'black' ? 'warning' : 'question'}`)
            .on("mouseover", () => {
              const position = Utils.getPosition(d3.event)
              const node = JSON.parse(JSON.stringify(edges.find((e) => e.index === i) || ''))
              const targets = document.querySelectorAll(`line[index="${i}"]`)
              const targetNode = targets[targets.length - 1]
              tooltipHoverDelayTimer = setTimeout(() => Utils.showTooltipAt(diagram, node, targetNode, position), 500)
            })
            .on("mouseout", () => {
              clearTimeout(tooltipHoverDelayTimer)
              setTimeout(() => Utils.clearTooltips(dom), 500)
            })
        })

      // controls all node drawing and formatting
      if (groups) {
        graphics.groups = layer.dom.layerContainer.selectAll(".group")
          .data(groups)
          .enter().append("g")
          .on("mousedown", d => {
            if (Opened.value.includes(d.id)) layer.focusedGroup = d.id
            else layer.focusedGroup = -1
          })
          .on("dblclick", d => {
            if (d.isEmpty) return
            window.history.forward()
            Graphics.focus(diagram, d)
          })
          .call(Graphics.drag(diagram, layer, graphics))

        graphics.groups.append("rect")
          .attr("class", "group-rect")
          .attr("stroke", "#83bad6")
          .attr("stroke-width", 10)
          .attr("rx", 15)
          .attr("fill", d => d.isEmpty ? "lightgrey" : "#99d9ea")
          .attr("opacity", 1)
          .style("pointer-events", "all")
        // .style("cursor", "move")

        graphics.groups.append("text")
          .text(d => d.name)
          .attr("class", "group-text")
          .attr("style", "font-size: 36px; font-family: Arial, Helvetica, sans-serif")

        graphics.groups
          .append('image')
          .attr("class", 'group-image')
          .attr("xlink:href", 'assets/Graphics/group.png')

        graphics.groups.append("image")
          .attr('idx', (d, i) => `g-${i}`)
          .attr("class", 'close-button-image')
          .attr("href", "assets/img/close.png")
          .attr("height", 30)
          .attr("style", "display: none")
          .on("mousedown", function () {
            d3.event.stopPropagation();
          })
          .on("mouseup", d => {
            d3.event.stopPropagation();
            const ids = diagram.groups.filter(g => g.parent === d.id).map(e => e.id)
            ids.forEach(id => {
              const index = Opened.value.findIndex(e => e === id)
              if (index > -1) Opened.value.splice(index, 1)
            })
            Opened.set(diagram)
            if (window.history.state) window.history.back()
          })
      }

      // controls all node drawing and formatting
      graphics.nodes = layer.dom.layerContainer.selectAll(".node")
        .data(nodes)
        .enter().append("g")
        .attr('class', 'node')
        .on("mouseover", function (d) {
          const position = Utils.getPosition(d3.event)
          const targetNode = d3.event.target;
          const node = JSON.parse(JSON.stringify(d))
          tooltipHoverDelayTimer = setTimeout(() => Utils.showTooltipAt(diagram, node, targetNode, position), 500);
        })
        .on("mouseout", function (d) {
          clearTimeout(tooltipHoverDelayTimer)
          setTimeout(() => Utils.clearTooltips(dom), 500);
        })
        .on("dblclick", d => {
          d3.event.stopPropagation()
          if (diagram.layers.find(e => e.id === d.name)) {
            if (d.dev != null) window.location.assign(`${apiUrl}?d=${d.dev}`)
          } else
            Layers.drillDown.do(diagram, d)
        })
        .call(Simulations.drag(diagram, layer))

      //attach image to node
      graphics.nodes.append("image")
        .attr('index', (d, i) => i)
        .attr("xlink:href", d => d.image)
        .attr("height", d => {
          const h = 60
          return d.isCloud ? (h * 1.5) : h
        })
        .attr("width", d => {
          const w = 60
          return d.isCloud ? (w * 1.5) : w
        })
        .attr("x", d => {
          const x = -30
          return d.isCloud ? (x * 1.5) : x
        })
        .attr("y", d => {
          const y = -30
          return d.isCloud ? (y * 1.5) : y
        })
      // .attr("opacity", d => Utils.getFillColor(d.status) === 'grey' ? .5 : 1)

      //circle for node
      graphics.nodes.append("circle")
        .attr('index', (d, i) => i)
        .attr("r", 50)
        .attr("opacity", .5)

      //controls the labels for each node
      graphics.nodes.append("text")
        .style("font-size", d => d.isCloud ? "13px" : "16px")
        .style("fill", "black")
        .style("font-family", "Arial, Helvetica, sans-serif")
        .attr("text-anchor", "middle")
        .style("pointer-events", "none")
        .attr("dy", d => {
          const dy = 45
          return d.isCloud ? (dy * 0.1) : dy
        })
        .text(d => {
          if (d.isUnmanaged) {
            return ""
          } else if (d.isCloud) {
            if (!d.isPrivate && Data.onlyHasOneDev(diagram, d.subnet)) {
              return "Internet"
            }
            return d.subnet
          } else {
            return d.name
          }
        })

      Graphics.refreshStatus(layer)
    }
  }
  const timeoutRefresh = 300000
  const apiUrl = 'devices.html'
  const dataUrl = 'api/diagramlayer3.json'
  const Data = {
    // control output for bandwidth
    downScaleBandwidth(val) {
      return [
        [100000000000, "100gig"],
        [50000000000, "50gig"],
        [40000000000, "40gig"],
        [25000000000, "25gig"],
        [20000000000, "20gig"],
        [10000000000, "10gig"],
        [1000000000, "1gig"],
        [100000000, "100meg"],
        [10000000, "10meg"],
        [0, `${val}bits`]
      ].find(([limit]) => val >= limit)[1]
    },
    inPubInt(subnet) {
      let splitSubnet = subnet.split(".")

      switch (splitSubnet[0]) {
        case "10":
          return false
        case "169":
          return splitSubnet[1] !== "254"
        case "172":
          return (!(parseInt(splitSubnet[1]) > 15 && parseInt(splitSubnet[1]) < 32))
        case "192":
          return splitSubnet[1] !== "168"
        default:
          return true
      }
    },
    onlyHasOneDev({edges}, sub) {
      let count = 0

      for (const edge of edges) {
        if (edge.target === "Cloud-" + sub) count++
      }

      if (count > 1) {
        // normal cloud, do nothing different
        return false
      }

      return true
    },
    process(layer, graph) {
      const {autocompleteItems} = layer

      if (!graph.subnets) graph.subnets = []
      graph.subnets.forEach(sub => {
        sub.isCloud = true
        // for clouds, take subnet instead of name unless WAN cloud
        if (sub.isUnmanaged) {
          autocompleteItems.push(sub.name)
        } else {
          autocompleteItems.push(sub.subnet)
        }
      })
      graph.devices.forEach(node => autocompleteItems.push(node.name))

      // nodes = devices + subnets
      const nodes = layer.nodes = graph.devices.concat(graph.subnets), edges = layer.edges = graph.links,
        groups = layer.groups = graph.groups?.map((group, i) => ({id: i, ...group}))

      edges.forEach(edge => {
        const source = _.find(nodes, d => d.name === edge.source), target = _.find(nodes, d => d.name === edge.target)

        if (source) edge.source = source
        if (target) edge.target = target

        if (groups && source && target) {
          if (source.hasOwnProperty("group") && !target.hasOwnProperty("group")) {
            target.group = source.group
          } else if (source.hasOwnProperty("group") && target.hasOwnProperty("group") && groups[source.group].parent !== target.group && groups[target.group].parent !== source.group && source.group !== target.group) {
            if (source.isCloud) delete source.group
            if (target.isCloud) delete target.group
          }
        }

        edge.width = edge.isStaticWan ? 5 : Utils.getLinkWidth(edge.bandwidth)
      })
    },
    fetch(url) {
      return new Promise((resolve, reject) => {
        const setFlags = (data) => {
          data?.devices?.forEach(d => d.isDevice = true)
          data?.groups?.forEach((d, i) => {
            if (!data?.devices?.find(e => e.group === i)) {
              d.isEmpty = true
            }
          })
          const trunks = {}
          data?.links?.filter(d=>d.trunk).forEach((d, i) => {
            const {source,target} = d
            const key = `${source}.${target}`
            if (trunks[key] == null) {
              const count = data?.links?.filter(d => d.trunk && d.source === source && d.target === target).length
              trunks[key] = {index: 0, count}
            }
            trunks[key].index = trunks[key].index + 1
            const isEvenCount = trunks[key].count % 2 === 0
            const isEvenIndex = trunks[key].index % 2 === 0
            const correct = isEvenCount ? .5 : 0
            const offset = Math.min(10, 40 / trunks[key].count) * (!isEvenCount && trunks[key].index === 1 ? 0 : 1)
            d.trunkOffset = (offset * Math.floor((((isEvenCount && !isEvenIndex) || (!isEvenCount && trunks[key].index === 1) ? 1 : 0) + trunks[key].index) / 2) - offset * correct) * (isEvenIndex ? 1 : -1)
          })
          return data
        }
        d3.json(url, (error, graph) => {
          if (error) {
            reject(error)
          } else {
            resolve(setFlags(graph))
          }
        })
      })
    }
  }

  const UI = {
    toolbar: {
      searchForm: {
        search(diagram, value) {
          let exactMatch = Utils.findAndFocus(diagram, value)

          if (!exactMatch) {
            let items = diagram.dom.searchAutocompleteList.children
            if (items && items.length > 0) {
              items[0].click()
            }
          }
        },
        autocompleteSetup(diagram, input) {
          const {dom} = diagram
          let list, currentFocus = -1

          function setActive(items) {
            if (!items) return false
            items[currentFocus].classList.add("autocomplete-active")
          }

          function removeActive(items) {
            if (!items || currentFocus < 0) return false
            items[currentFocus].classList.remove("autocomplete-active")
          }

          input.addEventListener("input", () => {
            const val = input.value, items = diagram.autocompleteItems
            if (!val) return false
            if (list) list.remove()
            currentFocus = -1
            list = dom.searchAutocompleteList = document.createElement("div")
            list.setAttribute("class", "autocomplete-items")
            input.parentNode.appendChild(list)
            items.forEach(item => {
              /*check if the item starts with the same letters as the text field value:*/
              if (item.substring(0, val.length).toUpperCase() !== val.toUpperCase()) return
              /*create a DIV element for each matching element:*/
              const itemEl = document.createElement("div")
              /*make the matching letters bold:*/
              itemEl.innerHTML = `<strong>${item.substr(0, val.length)}</strong>${item.substr(val.length)}`
              /*insert a input field that will hold the current array item's value:*/
              itemEl.innerHTML += `<input type='hidden' value='${item}'>`
              itemEl.addEventListener("click", () => {
                input.value = item
                Utils.findAndFocus(diagram, item)
                list.remove()
              })
              itemEl.style.height = "20px"
              itemEl.style.padding = "5px"
              itemEl.style.fontSize = "12px"
              itemEl.style.width = "300px"
              list.appendChild(itemEl)
            })
          })
          /*execute a function presses a key on the keyboard:*/
          input.addEventListener("keydown", e => {
            let items = list ? list.querySelectorAll("div") : null

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

              let exactMatch = Utils.findAndFocus(diagram, input.value)
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
          Utils.registerDocumentEventListener(diagram, "click", e => {
            if (list && list !== e.target) list.remove()
          })
        },
      },
      styleModeButtons({dom, settings}) {
        if (settings.floatMode) {
          dom.toolbar.querySelector(".button.float").style.fill = "black"
          dom.toolbar.querySelector(".button-label.float").style.fill = "white"
          dom.toolbar.querySelector(".button.lock").style.fill = "white"
          dom.toolbar.querySelector(".button-label.lock").style.fill = "#596877"
        } else {
          dom.toolbar.querySelector(".button.lock").style.fill = "black"
          dom.toolbar.querySelector(".button-label.lock").style.fill = "white"
          dom.toolbar.querySelector(".button.float").style.fill = "white"
          dom.toolbar.querySelector(".button-label.float").style.fill = "#596877"
        }
      },
      toggle({dom, settings}) {
        settings.toolbar = !settings.toolbar
        dom.toolbar.style.display = settings.toolbar ? "block" : "none"
      },
      create(diagram) {
        const {dom, settings, autocompleteItems} = diagram, toolbar = dom.toolbar = document.createElement("div")

        toolbar.classList.add("toolbar")
        toolbar.innerHTML += `
          <form class="search-form" autocomplete="off">
            <div class="autocomplete">
              <input type="text" placeholder="Search">
            </div>
            <svg>
              <g class="button search">
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
            <g class="button float">
              <rect height="100%" width="30px"></rect>
              <text class="button-label float" x="4.5" y="13">Float</text>
            </g>
            <g class="button lock">
              <rect height="100%" width="30px"></rect>
              <text class="button-label lock" x="5" y="13">Lock</text>
            </g>
          </svg>
          <div class="button visio-export">
            <img src="assets/img/VisioIcon.png"/>
          </div>
          <div class="button detach">
            <a onclick="openWindow('DiagramDetach.html',1000,600)">Detach</a>
          </div>
          <div class="ip-toggle">
            <input type="checkbox" />
            <label class="label">Show IP Address</label>
          </div>
          <svg class="reset-tools">
            <g class="reset button">
              <rect height="100%" width="30px"></rect>
              <text class="button-label" x="3" y="13">Reset</text>
            </g>
          </svg>
          <div class="help">Double-click on an element to interact</div>
        `

        const searchFormInput = toolbar.querySelector(".search-form input")

        toolbar.querySelector(".zoom-in").addEventListener("click", () => Zoom.increment(diagram))
        toolbar.querySelector(".zoom-out").addEventListener("click", () => Zoom.decrement(diagram))
        toolbar.querySelector(".button.float")
          .addEventListener("click", () => !settings.floatMode && toggleFloatMode(diagram))
        toolbar.querySelector(".button.lock")
          .addEventListener("click", () => settings.floatMode && toggleFloatMode(diagram))
        toolbar.querySelector(".button.visio-export").addEventListener("click", () => doVisioExport(diagram))
        toolbar.querySelector(".button.reset").addEventListener("click", () => reset(diagram))
        toolbar.querySelector(".button.search")
          .addEventListener("click", () => this.searchForm.search(diagram, searchFormInput.value))

        // const groupingToggle = toolbar.querySelector(".groupings-toggle input")
        // groupingToggle.checked = settings.grouping
        // groupingToggle.addEventListener("click", () => Grouping.toggle(diagram))

        const ipAddressToggle = toolbar.querySelector(".ip-toggle input");
        ipAddressToggle.checked = settings.showIpAddress;
        ipAddressToggle.addEventListener("click", () => IpAddress.toggle(diagram))

        this.searchForm.autocompleteSetup(diagram, searchFormInput, autocompleteItems)
        this.styleModeButtons(diagram)

        // hide if toggled off
        if (!settings.toolbar) toolbar.style.display = "none"

        return toolbar
      }
    },
    teardown({dom}) {
      const containerEl = dom.container.node()

      while (containerEl.firstElementChild) {
        containerEl.firstElementChild.remove()
      }
    },
    loading: {
      start({dom}) {
        dom.spinner = dom.container.append("rect").attr("class", "loader")
      },
      finish({dom}) {
        dom.spinner.remove()
      },
    },
    initSymbols(container) {
      const svg = d3.select(container)
        .append("svg")
        .style('display', 'none')
      let symbol = svg.append("defs")
        .append('g')
        .attr("transform", "scale(0.05)")
        .attr("id", "warning")
      symbol
        .append("rect")
        .attr("y", -120)
        .attr("x", -50)
        .attr("width", 100)
        .attr("height", 300)
        .attr("fill", 'black')
      symbol
        .append('path')
        .attr("transform", "translate(-256,-256)")
        .attr("d", "M 256 32 c 14.2 0 27.3 7.5 34.5 19.8 l 216 368 c 7.3 12.4 7.3 27.7 0.2 40.1 S 486.3 480 472 480 H 40 c -14.3 0 -27.6 -7.7 -34.7 -20.1 s -7 -27.8 0.2 -40.1 l 216 -368 C 228.7 39.5 241.8 32 256 32 Z m 0 128 c -13.3 0 -24 10.7 -24 24 V 296 c 0 13.3 10.7 24 24 24 s 24 -10.7 24 -24 V 184 c 0 -13.3 -10.7 -24 -24 -24 Z m 32 224 a 32 32 0 1 0 -64 0 a 32 32 0 1 0 64 0 Z")
        .attr("fill", "orange")

      symbol = svg.append("defs")
        .append('g')
        .attr("transform", "scale(0.05)")
        .attr("id", "question")
      symbol
        .append("rect")
        .attr("y", -150)
        .attr("x", -150)
        .attr("width", 300)
        .attr("height", 300)
        .attr("fill", 'black')
      symbol
        .append('path')
        .attr("transform", "translate(-256,-256)")
        .attr("d", "M 256 512 A 256 256 0 1 0 256 0 a 256 256 0 1 0 0 512 Z M 169.8 165.3 c 7.9 -22.3 29.1 -37.3 52.8 -37.3 h 58.3 c 34.9 0 63.1 28.3 63.1 63.1 c 0 22.6 -12.1 43.5 -31.7 54.8 L 280 264.4 c -0.2 13 -10.9 23.6 -24 23.6 c -13.3 0 -24 -10.7 -24 -24 V 250.5 c 0 -8.6 4.6 -16.5 12.1 -20.8 l 44.3 -25.4 c 4.7 -2.7 7.6 -7.7 7.6 -13.1 c 0 -8.4 -6.8 -15.1 -15.1 -15.1 H 222.6 c -3.4 0 -6.4 2.1 -7.5 5.3 l -0.4 1.2 c -4.4 12.5 -18.2 19 -30.6 14.6 s -19 -18.2 -14.6 -30.6 l 0.4 -1.2 Z M 224 352 a 32 32 0 1 1 64 0 a 32 32 0 1 1 -64 0 Z")
        .attr("fill", "orange")
    },
    create(diagram, container) {
      const dom = diagram.dom = {}
      UI.initSymbols(container)
      dom.container = d3.select(container).classed("diagram", true).classed("widget-mode", Utils.isWidget())
      dom.container.append(() => this.toolbar.create(diagram))
      dom.visContainer = dom.container.append("div")
        .style("position", "relative")
        .style("width", "100%")
        .style("height", "100%")
        .attr("class", "diagram-svg-container")
    }
  }

  function doVisioExport({nodes, edges, groups, focusedGroup}) {
    let data, name = "TotalView Diagram-"

    if (focusedGroup > -1) {
      data = {
        nodes: nodes.filter(n => n.group === focusedGroup),
        edges: edges.filter(e => e.source.group === focusedGroup && e.target.group === focusedGroup),
      }
      name += groups[focusedGroup].name
    } else {
      data = {nodes, edges, groups}
      name += "Main"
    }
    visioExport.generate(data, name)
  }

  function toggleFloatMode(diagram) {
    diagram.settings.floatMode = !diagram.settings.floatMode
    UI.toolbar.styleModeButtons(diagram)
  }

  const Layers = {
    init(diagram) {
      const layers = diagram.layers = [];

      [
        "nodes",
        "edges",
        "graphics",
        "simulations",
        "autocompleteItems",
        "focusedGroup",
        "transform",
        "zoomBehavior",
        "groups",
      ].forEach(key => {
        Object.defineProperty(diagram, key, {
          get() {
            return layers[0][key]
          },
          set(val) {
            layers[0][key] = val
          }
        })
      });
      [
        "svg",
        "layerContainer"
      ].forEach(key => {
        Object.defineProperty(diagram.dom, key, {
          get() {
            return layers[0].dom[key]
          },
          set(val) {
            layers[0].dom[key] = val
          }
        })
      })
      Object.defineProperty(diagram, "currentLayer", {
        get() {
          return layers[0]
        }
      })
    },
    async toggle(layer, show, duration = 1000) {
      Object.values(layer.dom).forEach(el => {
        el.transition().duration(duration).ease(d3.easeLinear).style("opacity", show ? 1 : 0)
      })
      return new Promise(resolve => setTimeout(resolve, duration))
    },
    async push(id, diagram, data, {delay, fadeDuration} = {delay: 0, fadeDuration: 1000}) {
      const layer = {
        id,
        diagram,
        dom: {},
        graphics: {},
        autocompleteItems: [],
        focusedGroup: -1,
        settings: diagram.settings,
        processing: true
      }, first = !diagram.layers

      if (first) this.init(diagram)
      diagram.layers.unshift(layer)

      layer.dom.svg = diagram.dom.visContainer.append("svg")
        .style("width", "100%").style("height", "100%")

      // clear all tooltip on global mousedown
      layer.dom.svg.node().addEventListener("mousedown", () => Utils.clearTooltips(layer.dom))

      if (!first) {
        const visContainer = diagram.dom.visContainer.node()

        layer.dom.svg
          .style("width", visContainer.clientWidth - 60)
          .style("height", visContainer.clientHeight - 60)
          .style("position", "absolute")
          .style("background", "transparent")
          .style("left", 30)
          .style("top", 30)
          .style("z-index", diagram.layers.length + 1)
          .style("opacity", 0)

        layer.dom.svg.append("rect")
          .attr("class", "group-rect")
          .attr("stroke", "#83bad6")
          .attr("stroke-width", 10)
          .attr("rx", 15)
          .attr("fill", "#99d9ea")
          .attr("opacity", 1)
          .style("pointer-events", "all")
          // .style("cursor", "move")
          .attr("x", 5)
          .attr("y", 5)
          .style("width", "calc(100% - 10px)")
          .style("height", "calc(100% - 10px)")
          .attr("fill", "#eee")

        layer.dom.svg.append("text")
          .text(id)
          .attr("transform", `translate(${15}, ${45})`)
          .attr("class", "group-text")
          .attr("style", "font-size: 36px; font-family: Arial, Helvetica, sans-serif")

        layer.dom.closeButton = diagram.dom.visContainer.append("img")
          .attr("src", "assets/img/close.png")
          .attr("class", "clickable")
          .style("height", "30px")
          .style("width", "30px")
          .style("position", "absolute")
          .style("z-index", 999)
          .style("top", "25px")
          .style("left", visContainer.clientWidth - 55 + "px")
        layer.dom.closeButton.on("click", function () {
          window.history.back()
        })
      }
      layer.dom.layerContainer = layer.dom.svg.append("g")
      Zoom.init(diagram, layer)

      // then we show the loading spinner in case data fetching takes a while
      UI.loading.start(diagram)

      if (!first) {
        setTimeout(() => {
          this.toggle(layer, true, fadeDuration)
          if (diagram.layers.length > 2) {
            Layers.remove(diagram.layers[1])
          }
        }, delay)
      }

      // then we wait for and parse the data
      Data.process(layer, await data)

      // then we set the graphics
      Graphics.create(diagram, layer, first)

      UI.loading.finish(diagram)

      return layer
    },
    async remove(layer) {
      if (layer.processing) return
      layer.processing = true
      layer.diagram.layers.splice(layer.diagram.layers.findIndex(l => layer === l), 1)
      await this.toggle(layer, false)
      Object.values(layer.dom).forEach(el => el.remove())
    },
    drillDown: {
      apiUrl: dataUrl,
      async device(diagram, node) {
        let dataPromise = Data.fetch(`${this.apiUrl}?device=${node.name}`).then(data => {
          const nestedLinks = data.links.filter((link) => link.source === node.name)
          const trunkLinks = data.links.filter((link) => link.trunk && [link.source, link.target].includes(node.name))
          const siblingLinks = data.links.filter((slink) => nestedLinks.findIndex(nlink => nlink.target === slink.target && slink.source !== node.name) !== -1)
          const nestedDevices = data.devices.filter((device) => siblingLinks.findIndex(slink => slink.source === device.name) !== -1 && device.name !== node.name)
          return {
            devices: [
              _.cloneDeep(node),
              ...nestedDevices
            ],
            links: [
              ...siblingLinks.map((link) => ({
                ...link,
                "target": node.name,
              })), ...trunkLinks
            ]
          };
        })
        return (await Layers.push(node.name, diagram, dataPromise))
      },
      async subnet(diagram, node) {
        let dataPromise = Data.fetch(`${this.apiUrl}?device=${node.name}`).then(data => {
          const nestedLinks = data.links.filter((link) => link.target === node.name)
          const trunkLinks = data.links.filter((link) => link.trunk && nestedLinks.find((nlink) => nlink.source === link.source))
          const nestedDevices = data.devices.filter((device) => nestedLinks.findIndex(nlink => nlink.source === device.name) !== -1)

          return {
            devices: [
              _.cloneDeep(node),
              ...nestedDevices
            ],
            links: [...nestedLinks, ...trunkLinks]
          };
        })
        return (await Layers.push(node.name, diagram, dataPromise))
      },
      async do(diagram, node) {
        let layer
        window.history.forward()
        if (node.isCloud) {
          layer = await this.subnet(diagram, node)
        } else {
          layer = await this.device(diagram, node)
        }
        const layerContainer = layer.dom.svg.node();
        const msg = 'Loading...'
        layer.dom.svg.selectAll("g").style('visibility', 'hidden')
        layer.dom.svg
          .attr("class", "-drill-down-")
          .append("text")
          .text(msg)
          .attr("transform", `translate(${(layerContainer.clientWidth - msg.length * 20) / 2}, ${layerContainer.clientHeight / 2})`)
          .attr("class", "loading")
          .attr("style", "font-size: 36px; font-family: Arial, Helvetica, sans-serif; fill: grey")
        Simulations.init(diagram, layer)
        diagram.simulations.nodes.force("charge", d3.forceManyBody().strength(-7000))
        if (Layout.get(diagram, layer)) {
          Layout.restore(diagram, layer)
        } else {
          Simulations.nodes.isUpdating = true
          Graphics.update(layer)
          while (Simulations.nodes.isUpdating) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        Layout.center(diagram, layer)
        IpAddress.init(diagram, layer)
        layer.dom.svg.selectAll(".loading").remove()
        layer.dom.svg.selectAll("g")
          .transition()
          .duration(1000)
          .style('visibility', 'visible')

        layer.processing = false
      }
    }
  }

  function reset(diagram) {
    if (!confirm("Are you sure you want to clear all saved locations and revert all devices to natural float?")) return
    // clear stored layout and zoom
    Layout.clear(diagram)
    Zoom.clear(diagram)
    location.reload()
  }

  function destroy(diagram, publicInstance) {
    clearTimeout(timer)
    Utils.cleanEventListeners(diagram)
    Simulations.teardown(diagram)
    UI.teardown(diagram)

    Object.keys(publicInstance).forEach(key => delete publicInstance[key])
    Object.keys(diagram).forEach(key => delete diagram[key])
    diagram = null
  }

  function updateSettings(diagram, newSettings) {
    // const flags = ["toolbar", "grouping", "floatMode", 'showIpAddress'],
    const flags = [
        "toolbar",
        "grouping",
        "floatMode"
      ], ////
      {settings} = diagram
    let zoomParametersChanged = false

    Object.keys(newSettings).forEach(key => {
      const value = newSettings[key]

      // if value is a boolean flag and is set to change
      if (flags.includes(key) && value !== settings[key]) {
        // validate that flag value is a boolean
        if (typeof value !== "boolean") throw new Error(`${key} must be a boolean value`)
        // execute the corresponding method
        switch (key) {
          case "toolbar":
            UI.toolbar.toggle(diagram)
            break
          // case "grouping":
          //   Grouping.toggle(diagram)
          //   break
          case 'showIpAddress':
            IpAddress.toggle(diagram);
            break;
          case "floatMode":
            toggleFloatMode()
            break
        }
      } else {
        switch (key) {
          case "maxZoomIn":
          case "maxZoomOut":
            zoomParametersChanged = true
            break
          default:
            break
        }
        settings[key] = value
      }
    })

    if (zoomParametersChanged) {
      Zoom.applySettings(diagram)
    }
  }

  const historyState = (diagram, layer) => {
    Opened.value = Opened.get(diagram)

    if (!window.history.state) window.history.pushState('next', null)
    if (Opened.value.length) window.history.forward()

    window.onpopstate = (e) => {
      Utils.clearTooltips(layer.dom)
      if (!e.state) {
        if (diagram.layers.length>1) {
          Layers.remove(diagram.layers[0])
          if (Opened.value.length) window.history.forward()
          return
        }
        Opened.value.pop()
        Opened.set(diagram)
        if (Opened.value.length) {
          Graphics.restore(diagram)
          window.history.forward()
        } else {
          Graphics.restore(diagram, layer)
        }
      }
      return true
    }
  }

  /**
   * Create a diagram instance
   * @param {string} id - An identifier for the diagram. This is used as part of the key to isolate persistent settings in localStorage.
   * @param {Object} container - The container DOM node.
   * @param {Object} settings - Settings object.
   * @param {boolean} settings.toolbar - flag for toolbar showing up
   * @param {boolean} settings.grouping - flag for grouping
   * @param {boolean} settings.floatMode - flag for float/lock mode toggle (true = float mode)
   * @param {number} settings.groupPadding - padding between groups that the simulation tries to maintain
   * @param {number} settings.groupBorderWidth - group border width
   * @param {number} settings.zoomInMult - zoom increment multiplier
   * @param {number} settings.zoomOutMult - zoom decrement multiplier
   * @param {number} settings.maxZoomIn - maximum allowed zoom value
   * @param {number} settings.maxZoomOut - minimum allowed zoom value
   */
  async function create(id, container, settings = {}) {
    const diagram = {id, dom: {container}, docEventListeners: []}
    diagram.settings = Object.assign({
      toolbar: false,
      grouping: Store.get(diagram, "grouping") !== "false",
      showIpAddress: Store.get(diagram, "showIpAddress") === 'true',
      floatMode: true,
      groupPadding: 75,
      groupBorderWidth: 10,
      zoomInMult: 1.25,
      zoomOutMult: 0.8,
      maxZoomIn: 8,
      maxZoomOut: 0.1,
    }, settings)
    UI.create(diagram, container)
    const layer = await Layers.push("main", diagram, Data.fetch(dataUrl))
    const isLayout = !!Layout.get(diagram)
    historyState(diagram, layer)
    layer.processing = false
    UI.loading.start(diagram)
    if (isLayout) {
      d3.select(container).select('.diagram-svg-container').style('display', 'none')
    }
    Simulations.init(diagram, layer)
    IpAddress.init(diagram, layer)
    if (isLayout) {
      Simulations.nodes.isUpdating = true
      while (Simulations.nodes.isUpdating) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      d3.select(container).select('.diagram-svg-container').style('display', 'block')
    }
    Layout.restore(diagram, layer)
    Zoom.restore(diagram, layer)
    Graphics.fetchStatus(diagram)
    UI.loading.finish(diagram)
    if (isLayout) {
      Graphics.restore(diagram)
    }
    return {
      destroy() {
        destroy(diagram, this)
      },
      reset: () => reset(diagram),
      doVisioExport: () => doVisioExport(diagram),
      updateSettings: (newSettings) => updateSettings(diagram, newSettings),
      toggleFloatMode: () => toggleFloatMode(diagram),
      toggleIpAddress: () => IpAddress.toggle(diagram),
      toggleGrouping: () => Grouping.toggle(diagram),
      toggleToolbar: () => UI.toolbar.toggle(diagram)
    }
  }

  return {
    create,
    updateSettings
  }
}()
