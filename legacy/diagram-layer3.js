/*global d3, _, visioExport*/
"use strict"

const FLOATMODE = {
  FLOAT_ALL: 0,
  FLOAT: 1,
  LOCK: 2,
  LOCK_ALL: 3,
}
const DIAGRAM_WEIGHT = {
  MIN: 0,
  MAX: 100,
}
let GLOBAL_WEIGHT = 1
let FOCUSED_GROUP_ID = -1
let GLOBAL_DATA
let GLOBAL_STATUS = {
  isSet: false,
  groups: [],
  devices: [],
  subnets: [],
  layout: {},
}
let GLOBAL_TABS = []
let GLOBAL_ACTIVE_TAB
let GLOBAL_SELECTED_TAB
let GLOBAL_EDIT_STATUS = false

const Diagram = (function () {
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

  const Utils = {
    isFixed({ focusedGroup }, node) {
      return node.fx != null
        ||
        node.nodes && (
          node.nodes.some(n => n.fx != null)
          ||
          focusedGroup === node.id
        )
    },
    haveIntersection({ settings }, r1, r2) {
      const { groupBorderWidth } = settings

      return !(
        r2.x - groupBorderWidth > r1.x + r1.width ||
        r2.x + r2.width < r1.x - groupBorderWidth ||
        r2.y - groupBorderWidth > r1.y + r1.height ||
        r2.y + r2.height < r1.y - groupBorderWidth
      )
    },
    inInteractMode() {
      return d3.event.shiftKey || d3.event.sourceEvent?.shiftKey
    },
    findNode({ nodes }, value) {
      return nodes.find(node => node.subnet === value || node.name === value)
    },
    findAndFocus(diagram, value) {
      const node = this.findNode(diagram, value)

      if (node) {
        Zoom.focusOnNode(diagram, node)
        return true
      } else {
        return false
      }
    },
    registerDocumentEventListener({ docEventListeners }, type, listener) {
      document.addEventListener(type, listener)
      docEventListeners.push([type, listener])
    },
    cleanEventListeners({ docEventListeners }) {
      docEventListeners.forEach(([type, listener]) => document.removeEventListener(type, listener))
    },
    isWidget() {
      return window.psDashboardWidgetMode
    },
    parseJSON(value) {
      if (typeof value !== "string") return value

      try {
        return JSON.parse(value)
      } catch(e) {
        console.error(e)
        return false
      }
    },
    removeDuplicatedLinks(arr) {
      const seen = new Set()
      return arr.filter(item => {
        const key = `${item.source}-${item.target}`
        if (seen.has(key)) {
          return false
        } else {
          seen.add(key)
          return true
        }
      })
    },
    generateEdgeKey(source, target) {
      return (source < target) ? `${source}:${target}` : `${target}:${source}`
    },
    async getSummarizedSubnets(source) {
      const center_device = _.cloneDeep(source)
      const connected_links = GLOBAL_DATA.edges.filter(edge => {
        if (edge.source !== source) return false
        const connected_subnet = edge.target
        const linksConnectedtoSubnet = GLOBAL_DATA.edges.filter(edge => edge.target == connected_subnet)
        return linksConnectedtoSubnet.length === 1
      })
      const nodes = [center_device]
      const edges = connected_links.map(link => {
        const new_target = _.cloneDeep(link.target)
        nodes.push(new_target)
        return {
          ...link,
          source: center_device,
          target: new_target,
        }
      })
      return { nodes, edges }
    },
    async getTrunkedSubnets(source, target) {
      const trunked_subnets = GLOBAL_DATA.subnets.filter(subnet => {
        const connected_links = GLOBAL_DATA.edges.filter(edge => edge.target == subnet)
        if (connected_links.length !== 2) return false
        return (connected_links[0].source == source &&
                connected_links[1].source == target) ||
            (connected_links[0].source == target &&
                connected_links[1].source == source)
      })
      const source_device = _.cloneDeep(source)
      const target_device = _.cloneDeep(target)
      const nodes = [source_device, target_device]
      source_device.displayGroup = 1
      target_device.displayGroup = 2
      const edges = []
      trunked_subnets.forEach(subnet => {
        const new_subnet = _.cloneDeep(subnet)
        new_subnet.displayGroup = 0
        nodes.push(new_subnet)
        const connected_links = GLOBAL_DATA.edges.filter(edge => edge.target == subnet)
        connected_links.forEach(connected_link => {
          if (connected_link.source == source) {
            edges.push({
              ...connected_link,
              source: source_device,
              target: new_subnet,
            })
          } else {
            edges.push({
              ...connected_link,
              source: target_device,
              target: new_subnet,
            })
          }
        })
      })
      return { nodes, edges }
    },
    getTextWidth(text, font = "36px Arial") {
      // Create a temporary span element
      let span = document.createElement("span")

      // Set the text content of the span
      span.textContent = text

      // Apply the font style to match the text you want to measure
      span.style.font = font

      // Make the span invisible but still able to measure width
      span.style.position = "absolute"
      span.style.visibility = "hidden"

      // Add the span to the body
      document.body.appendChild(span)

      // Get the width of the text
      let width = span.offsetWidth + 40

      // Remove the span after measurement
      document.body.removeChild(span)

      return width
    },
    isNodeVisible(node) {
      if (node.isCloud) {
        return GLOBAL_STATUS.subnets[node.id]
      }
      return GLOBAL_STATUS.devices[node.id]
    }
  }

  // -- storage --
  const Store = {
    keyPrefix: "diagrams",
    key({ id }, path) { return `${this.keyPrefix}.${id}.${path}` },
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
      const { settings } = diagram

      if (!layer) layer = diagram.currentLayer
      let active_layout = ""
      if (GLOBAL_ACTIVE_TAB) {
        GLOBAL_TABS.forEach(tab => {
          if (tab.title === GLOBAL_ACTIVE_TAB) {
            active_layout = tab.layout
          }
        })
      }
      // if (!diagram.layout) {
      //   diagram.layout =
      //     Utils.parseJSON(settings.layout ?? active_layout) ?? {};
      // }
      diagram.layout = Utils.parseJSON(settings.layout ?? active_layout) ?? {}

      return Utils.parseJSON(diagram.layout[layer.id])
    },
    restore(diagram) {
      const { nodes, groups } = diagram
      const layout = this.get(diagram)

      if (!layout) return

      // check stored layout nodes and current nodes
      if (layout.nodes) {
        layout.nodes.forEach(storedNode => {
          nodes.forEach(node => {
            // and for each match restore their fixed positions
            if (storedNode.name === node.name) {
              node.fx = storedNode.fx
              node.fy = storedNode.fy
            }
          })
        })
      }

      // check stored layout groups and current groups
      if (layout.groups) {
        layout.groups.forEach(storedGroup => {
          groups.forEach(group => {
            // and for each match restore their fixed positions
            if (storedGroup.name === group.name) {
              group.fx = storedGroup.fx
              group.fy = storedGroup.fy
            }
          })
        })
      }
    },
    clear(diagram) {
      Store.remove(diagram, this.storageKey)
    },
    save: _.debounce(function(diagram) {
      const { nodes, groups, currentLayer } = diagram
      const newLayout = JSON.stringify({ nodes, groups })

      if (diagram.layout[currentLayer.id] !== newLayout) {
        diagram.layout[currentLayer.id] = newLayout
        if (GLOBAL_ACTIVE_TAB) {
          GLOBAL_TABS.forEach(tab => {
            if (tab.title === GLOBAL_ACTIVE_TAB) {
              tab.layout = _.cloneDeep(diagram.layout)
            }
          })
        }
        UI.tabbar.writeTabStatus()
      }
    }, 1000)
  }

  const Zoom = {
    async focus({ dom, zoomBehavior }, { x, y, scale = 1, duration = 250 }) {
      const svgEl = dom.svg.node()

      dom.svg
        .transition()
        .duration(duration)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(
          svgEl.clientWidth / 2 - x * scale,
          svgEl.clientHeight / 2 - y * scale
        ).scale(scale))

      return new Promise(resolve => setTimeout(resolve, duration + 100))
    },
    async focusOnNode(diagram, node, scale, duration) {
      // node.fx = node.x
      // node.fy = node.y
      Simulations.stop(diagram)
      return this.focus(diagram, { x: node.x, y: node.y, scale, duration })
    },
    async focusOnArea(diagram, { cx, cy, width, height, title_width }, duration) {
      const { dom } = diagram
      const svgEl = dom.svg.node()
      const scale = 0.9 / Math.max(Math.max(width, title_width ?? width) / svgEl.clientWidth, height / svgEl.clientHeight)

      return this.focus(diagram, { x: cx, y: cy, scale, duration })
    },
    scale(layer, by) {
      let { zoomBehavior, dom, focusedGroup } = layer
      if (focusedGroup > -1) return

      zoomBehavior.scaleBy(dom.svg.transition().duration(200), by)
    },
    increment(layer) {
      this.scale(layer, layer.settings.zoomInMult)
    },
    decrement(layer) {
      this.scale(layer, layer.settings.zoomOutMult)
    },
    onWheelScroll(layer) {
      return function(event) {
        const { focusedGroup, settings } = layer
        let delta

        // if a group is focused don't zoom
        if (focusedGroup > -1) return

        if (event.wheelDelta) {
          delta = event.wheelDelta
        } else {
          delta = -1 * event.deltaY
        }

        Zoom.scale(layer, delta > 0 ? settings.zoomInMult : settings.zoomOutMult)
      }
    },
    transform: {
      storageKey: "transform",
      // debounced to avoid storing in localStorage multiple times during zoom or other events
      save: _.debounce(function(diagram, value) {
        return Store.set(diagram, this.storageKey, JSON.stringify(value))
      }, 1000),
      clear(diagram) {
        Store.remove(diagram, this.storageKey)
      },
      get(diagram) {
        const { dom, settings } = diagram
        // return either the provided value, the stored transform or the default one
        return Utils.parseJSON(settings.transform)
          ??
          Store.getParsed(diagram, this.storageKey)
          ??
          { x: dom.svg.node().clientWidth / 2, y: dom.svg.node().clientHeight / 2, k: 0.1 }
      },
    },
    applySettings({ settings, zoomBehavior }) {
      zoomBehavior.scaleExtent([settings.maxZoomOut, settings.maxZoomIn])
    },
    restrictArea({ zoomBehavior, transform, dom }, area) {
      if (!area) {
        const svgEl = dom.svg.node()
        const wiggleRoom = 0

        if (!transform) transform = { x: 0, y: 0, k: 1 }
        area = [
          [(-transform.x - wiggleRoom) / transform.k, (-transform.y - wiggleRoom) / transform.k],
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
    restore(diagram, layer) {
      const transform = this.transform.get(diagram)
      // restore saved transform or set the default one
      layer.dom.svg.call(
        diagram.zoomBehavior.transform,
        d3.zoomIdentity.translate(transform.x, transform.y).scale(transform.k)
      )
    },
    init(diagram, layer) {
      const { dom } = layer

      layer.zoomBehavior = d3.zoom()
        .on("zoom", () => {
          // don't zoom if a group is focused
          if (layer.focusedGroup > -1 && d3.event.sourceEvent && d3.event.sourceEvent.type === "mousemove") return

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
    fromNodes(diagram, nodes) {
      const group = {}

      this.polygonGenerator(diagram, group, nodes)

      return group
    },
    // gets groups that are currently locked in position or that contain a node locked in position
    getFixed(diagram, otherThan) {
      let ret = diagram.groups ?? []

      if (otherThan != null) {
        const childGroups = GLOBAL_DATA.groups
          .filter(g => g.parent === otherThan)
          .map(g => g.id)
        const parentGroup = GLOBAL_DATA.groups.find(g => g.id === otherThan)?.parent

        ret = ret.filter(g => [...childGroups, otherThan, parentGroup].indexOf(g.id) === -1)
      }
      ret = ret.filter(group => Utils.isFixed(diagram, group))

      return ret
    },
    toggle(diagram) {
      const { settings, nodes, simulations, groups } = diagram
      if (!groups) return

      settings.grouping = !settings.grouping

      nodes.forEach(node => {
        const nodePx = node.px
        const nodePy = node.py
        node.px = node.x
        node.py = node.y
        if (nodePx != null) {
          node.x = nodePx
          node.y = nodePy
        }
      })

      const pAlpha = simulations.nodes.pAlpha
      const pGroupAlpha = simulations.groups.pAlpha
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
    polygonGenerator({ settings }, group, nodes, childNodes = []) {
      if(!nodes.length) return null
      let coords = nodes.reduce(
        (acc, d) => ({
          x: [Math.min(acc.x[0], d.x), Math.max(acc.x[1], d.x)],
          y: [Math.min(acc.y[0], d.y), Math.max(acc.y[1], d.y)],
        })
        ,
        { x: [nodes[0].x, nodes[0].x], y: [nodes[0].y, nodes[0].y] }
      )
      group.bounds = _.cloneDeep(coords)
      coords.x[0] -= settings.groupPadding
      coords.x[1] += settings.groupPadding
      coords.y[0] -= settings.groupPadding
      coords.y[1] += settings.groupPadding

      if (childNodes.length > 0) {
        childNodes.forEach(d => {
          coords.x[0] = Math.min(coords.x[0], d.x - settings.groupPadding * 2)
          coords.x[1] = Math.max(coords.x[1], d.x + settings.groupPadding * 2)
          coords.y[0] = Math.min(coords.y[0], d.y - settings.groupPadding * 2)
          coords.y[1] = Math.max(coords.y[1], d.y + settings.groupPadding * 2)
        })
      }

      Object.assign(group, {
        width: coords.x[1] - coords.x[0],
        height: coords.y[1] - coords.y[0]
      })

      let polygon = group.polygon = [
        [coords.x[0], coords.y[0]],
        [coords.x[1], coords.y[0]],
        [coords.x[1], coords.y[1]],
        [coords.x[0], coords.y[1]]
      ]

      group.x = coords.x[0]
      group.y = coords.y[0]
      group.cx = group.x + Math.max(group.width, group.title_width ?? group.width) / 2
      group.cy = group.y + group.height / 2

      return d3.polygonHull(polygon)
    },
    move(diagram, group, nodes, xDiff, yDiff, forceLock) {
      nodes.forEach(node => {
        node.x += xDiff
        node.y += yDiff
        if (node.fx ?? forceLock) node.fx = node.x
        if (node.fy ?? forceLock) node.fy = node.y
      })
    },
    update(diagram, layer) {
      const { settings, focusedGroup } = diagram
      const { groups, graphics } = layer

      if (!settings.grouping || !groups) return

      groups.forEach(group => {
        if (group.locked) return

        const groupId = group.id
        let points = group.nodes = graphics.nodes
          .filter(d => d.group === groupId)
          .data()
        let polygon

        if (group.hasChildGroup) {
          let childGroups = groups.filter(g => g.parent === groupId)
          let childPoints = graphics.nodes
            .filter(d => childGroups.some(cg => cg.id === d.group))
            .data()
          polygon = Grouping.polygonGenerator(diagram, group, points, childPoints)
        } else {
          polygon = Grouping.polygonGenerator(diagram, group, points)
        }

        if (!polygon) return

        if (focusedGroup === group.id) {
          graphics.groupCloseBtn
            .attr("x", group.x + Math.max(group.width, group.title_width ?? group.width) - 20)
            .attr("y", group.y - 10)
        }
        graphics.groupRect
          .filter(d => d === groupId)
          .attr("x", group.x)
          .attr("y", group.y)
          .attr("width", Math.max(group.width, group.title_width ?? group.width))
          .attr("height", group.height)
        graphics.groupTexts
          .filter(d => d === groupId)
          .attr("x", group.x + 20)
          .attr("y", group.y + 45)
          .attr("style", "font-size: 36px; font-family: Arial, Helvetica, sans-serif")

        graphics.groupBorders
          .filter(d => d === groupId)
          .attr("x", group.x)
          .attr("y", group.y)
          .attr("width", Math.max(group.width, group.title_width ?? group.width))
          .attr("height", group.height)

        if (graphics.tempGroupRect) {
          graphics.tempGroupRect
            .filter(d => d === groupId)
            .attr("x", group.x)
            .attr("y", group.y)
            .attr("width", Math.max(group.width, group.title_width ?? group.width))
            .attr("height", group.height)

          graphics.tempGroupTexts
            .filter(d => d === groupId)
            .attr("x", group.x + 20)
            .attr("y", group.y + 45)
            .attr("style", "font-size: 36px; font-family: Arial, Helvetica, sans-serif")
        }
      })
    },
    focus(diagram, groupId) {
      Grouping.unfocus(diagram)
      diagram.focusedGroup = groupId
      FOCUSED_GROUP_ID = groupId

      const group = diagram.groups.find(g => g.id === groupId)

      diagram.graphics.groupCloseBtn
        .attr("x", group.x + Math.max(group.width, group.title_width ?? group.width) - 20)
        .attr("y", group.y - 10)
        .attr("style", "display: block")
        .on("click", () => {
          this.unfocus(diagram, { k: 0.25 })
        })

      if (FOCUSED_GROUP_ID > -1) {
        diagram.graphics.links
          .filter(link => link.source.group !== FOCUSED_GROUP_ID && link.target.group !== FOCUSED_GROUP_ID)
          .attr("opacity", 0.9)
      }
      Zoom.focusOnArea(diagram, group)
    },
    unfocus(layer, targetZoom) {
      const { focusedGroup, groups, dom, zoomBehavior, graphics } = layer

      if (focusedGroup < 0) return
      const group = groups.find(g => g.id === focusedGroup)

      if (targetZoom) {
        dom.svg
          .transition()
          .call(zoomBehavior.scaleTo, targetZoom.k)
      }
      graphics.groupCloseBtn.style("display", "none")
      group.locked = false
      layer.focusedGroup = -1
      FOCUSED_GROUP_ID = -1
    },
    setup({ settings, graphics, simulations }) {
      if (!graphics.groupRect) return
      if (settings.grouping) {
        graphics.groupRect.attr("display", "block")
        graphics.groupCloseBtn.attr("display", "block")
        graphics.groupTexts.attr("display", "block")
        simulations.nodes
          .force("x", d3.forceX().strength(0.1)).force("y", d3.forceY().strength(0.1))
          .force("charge", d3.forceManyBody().strength(-3000))
      } else {
        graphics.groupRect.attr("display", "none")
        graphics.groupCloseBtn.attr("display", "none")
        graphics.groupTexts.attr("display", "none")
        simulations.nodes
          .force("x", d3.forceX().strength(0.4)).force("y", d3.forceY().strength(0.4))
          .force("charge", d3.forceManyBody().strength(-5000))
        simulations.groups.stop()
      }
    },
    box({ settings }, containers) {
      return containers.append("rect")
        .attr("class", "group-rect")
        .attr("stroke", "#83bad6")
        .attr("stroke-width", settings.groupBorderWidth)
        .attr("rx", 15)
        .attr("fill", "transparent")
        .attr("opacity", 1)
    },
    box_border({ settings }, containers) {
      return containers.append("rect")
        .attr("class", "group-rect")
        .attr("stroke", "#83bad6")
        .style("pointer-events", "none")
        .attr("stroke-width", settings.groupBorderWidth)
        .attr("rx", 15)
        .attr("fill", "transparent")
        .attr("opacity", 1)
    },
    box_temp({ settings }, containers) {
      return containers.append("rect")
        .attr("class", "group-rect")
        .attr("stroke", "#83bad6")
        .attr("stroke-width", settings.groupBorderWidth)
        .attr("rx", 15)
        .attr("fill", "#eee")
        .attr("opacity", 1)
    },
    closeButton(diagram, containers) {
      return containers.append("image")
        .attr("href", "assets/img/close.png")
        .attr("height", 30)
    },
    init(diagram, layer) {
      let fixedGroups = []
      let dragStart = {}
      let { settings } = diagram
      let { groups, edges, nodes, graphics, dom, simulations } = layer

      if (!groups || groups.length === 0) return

      const highlightGroup = _.throttle(group_id => {
        document.querySelector(".temp-elements").innerHTML = ""
        graphics.tempGroupExisted = true
        layer.dom.tempGroupsContainer = layer.dom.tempElements.append("g")
          .attr("class", "temp-groups")

        graphics.tempGroupContainers = dom.tempGroupsContainer.selectAll(".temp-groups")
          .data(groups.filter(group => group.id === group_id || group.parent === group_id).map(({ id }) => id))
          .enter()

        graphics.tempGroupRect = Grouping.box_temp(diagram, graphics.tempGroupContainers)
        graphics.tempGroupTexts = graphics.tempGroupContainers.append("text")
          .text(d => groups.find(g => g.id === d).name)
          .attr("class", "temp-group-text")

        const filtered_edges = edges.filter(link => {
            return link.source.group === group_id ||
                link.target.group === group_id ||
                GLOBAL_DATA.groups.find(g => g.id === link.source.group)?.parent === group_id ||
                GLOBAL_DATA.groups.find(g => g.id === link.target.group)?.parent === group_id
          })

        graphics.tempLinks = layer.dom.tempElements.selectAll("line")
          .data(filtered_edges)
          .enter()
          .append("line")
          .attr("stroke", d => {
            if (d.isStaticWan) {
              return "black"
            } else if (d.warning) {
              return "red"
            } else {
              if (d.isDetermined) return "green"
              return "gray"
            }
          })
          .attr("stroke-width", d => Math.min(d.width, 30))

        const filtered_nodes = nodes.filter(node => {
          if (node.group === group_id || GLOBAL_DATA.groups.find(g => g.id === node.group)?.parent === group_id) return true
          return Boolean(edges.some(edge => {
              if (edge.source !== node && edge.target !== node) return false
              return edge.source.group === group_id || edge.target.group === group_id
          }))
        })

        graphics.tempNodes = layer.dom.tempElements.selectAll(".node")
          .data(filtered_nodes)
          .enter()
          .append("g")

        graphics.tempNodes.append("circle")
          .filter(d => d.status === 0 || d.status === 1)
          .attr("r", 40)
          .attr("fill", d => (d.status === 0 ? "grey" : "red"))
          .attr("opacity", 0.6)

        //attach image to node
        graphics.tempNodes.append("image")
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

        //controls the labels for each node
        graphics.tempNodes.append("text")
          .style("font-size", d => (d.isCloud ? "13px" : "16px"))
          .style("fill", "black")
          .style("font-family", "Arial, Helvetica, sans-serif")
          .attr("text-anchor", "middle")
          .attr("dy", d => {
            const dy = 45
            return d.isCloud ? (dy * 0.1) : dy
          })
          .text(d => {
            if (d.isUnmanaged) {
              return ""
            } else if (d.isCloud) {
              if (Data.inPubInt(d.subnet) && Data.onlyHasOneDev(diagram, d.subnet)) {
                return d.isSummarized ? `${d.totalSubnets} Subnets` : "Internet"
              }
              return d.subnet
            } else {
              return d.name
            }
          })

        Graphics.update(layer)
        Grouping.update(diagram, layer)

        graphics.links
          .filter(link => !(link.source.group === group_id || link.target.group === group_id))
          .attr("opacity", 0.1)

        if (FOCUSED_GROUP_ID > -1) {
          graphics.links.filter(link =>
              link.source.group !== FOCUSED_GROUP_ID &&
              link.target.group !== FOCUSED_GROUP_ID &&
              GLOBAL_DATA.groups.find(g => g.id === link.source.group)?.parent !== FOCUSED_GROUP_ID &&
              GLOBAL_DATA.groups.find(g => g.id === link.target.group)?.parent !== FOCUSED_GROUP_ID
            )
            .attr("opacity", 0)
        }
      })

      const clearHighlightGroup = _.throttle(() => {
        document.querySelector(".temp-elements").innerHTML = ""
        graphics.tempGroupExisted = false
        graphics.tempLinks = null
        graphics.tempNodes = null
        graphics.tempGroupRect = null
        graphics.tempGroupTexts = null

        graphics.links.attr("opacity", 1)
        if (FOCUSED_GROUP_ID > -1) {
          graphics.links.filter(link =>
                link.source.group !== FOCUSED_GROUP_ID &&
                link.target.group !== FOCUSED_GROUP_ID &&
                GLOBAL_DATA.groups.find(g => g.id === link.source.group)?.parent !== FOCUSED_GROUP_ID &&
                GLOBAL_DATA.groups.find(g => g.id === link.target.group)?.parent !== FOCUSED_GROUP_ID
            )
            .attr("opacity", 0)
        }
      })

      graphics.groupContainers = dom.groupsContainer.selectAll(".group")
        .data(groups.sort((a, b) => a.parent - b.parent).map(({ id }) => id))
        .enter()
      // graphics.groupContainers = dom.groupsContainer.selectAll(".group")
      // .data(groups.filter(group => group.parent > -1)
      // .map(({ id }) => id))
      // .enter()
      graphics.groupRect = this.box(diagram, graphics.groupContainers)
        .call(d3.drag()
          .on("start", (p) => {
            if (Utils.inInteractMode() || layer.focusedGroup === p) return null
            if (!d3.event.active) {
              simulations.nodes.alphaTarget(0.7).restart()
              simulations.groups.alphaTarget(0.7).restart()
            }
            dragStart.x = d3.event.x
            dragStart.y = d3.event.y
            groups.find(g => g.id === p).sx = groups.find(g => g.id === p).x
            groups.find(g => g.id === p).sy = groups.find(g => g.id === p).y

            graphics.nodes.filter(d => {
                if (d.group < 0) return false
                return d.group === p || GLOBAL_DATA.groups.find(g => g.id === d.group).parent === p
              })
              .each(d => {
                d.fx = d.sx = d.x
                d.fy = d.sy = d.y
              })
            fixedGroups = this.getFixed(diagram, p)
          })
          .on("drag", (p) => {
            if (Utils.inInteractMode() || layer.focusedGroup === p) return null
            let fx = groups.find(g => g.id === p).sx - dragStart.x + d3.event.x
            let fy = groups.find(g => g.id === p).sy - dragStart.y + d3.event.y

            graphics.nodes.filter(d => {
              if (d.group < 0) return false
              return d.group === p || GLOBAL_DATA.groups.find(g => g.id === d.group).parent === p
            })
            .each(d => {
              d.fx = d.sx - dragStart.x + d3.event.x
              d.fy = d.sy - dragStart.y + d3.event.y
            })

            groups.find(g => g.id === p).fx = fx
            groups.find(g => g.id === p).fy = fy
          })
          .on("end", (p) => {
            if (Utils.inInteractMode()) return null
            let group = groups.find(g => g.id === p)

            if (!d3.event.active) {
              simulations.groups.alphaTarget(0)
              simulations.nodes.alphaTarget(0)
            }

            this.update(diagram, layer)

            if (settings.floatMode < 2 || fixedGroups.some(fg => Utils.haveIntersection(diagram, fg, group))) {
              group.fx = null
              group.fy = null
              graphics.nodes.filter(d => d.group === p).each(d => {
                d.fx = null
                d.fy = null
              })
              if (group.hasChildGroup) {
                let childGroups = groups.filter(g => g.parent === p)
                childGroups.forEach(cg => {
                  cg.fx = null
                  cg.fy = null
                })
                graphics.nodes.filter(d => childGroups.some(cg => cg.id === d.group))
                  .each(d => {
                    d.fx = null
                    d.fy = null
                  })
              }
            }
            Layout.save(diagram)
          })
        )
        .on("contextmenu", d => {
          d3.event.preventDefault();
          const x = d3.event.pageX // Cursor X position
          const y = d3.event.pageY // Cursor Y position
          diagram.dom.tooltipDiv.transition()
            .duration(200)
            .style("opacity", 0)
            .style("display", "none")
          // Create a custom menu
          const menu = document.createElement("div")
          menu.style.position = "absolute"
          menu.style.top = `${y}px`
          menu.style.left = `${x}px`
          menu.style.zIndex = 1000
          menu.innerHTML = `<div>View Details</div><div>Deselect Node</div>`

          document.querySelectorAll(".custom-context-menu")
            .forEach(el => el.remove())
          menu.className = "custom-context-menu"

          menu.addEventListener("click", e => {
            event.stopPropagation()
            if (e.target.innerText === "View Details") {
              this.focus(diagram, d)
            } else if (e.target.innerText === "Deselect Node") {
              Pannels.remove_group(diagram, d)
            }
            document.body.removeChild(menu)
          })

          menu.addEventListener("mouseover", () => {
            highlightGroup(d)
          })

          menu.addEventListener("mouseleave", () => {
            clearHighlightGroup()
          })

          document.body.appendChild(menu)
          document.addEventListener("pointerdown", e => {
            if (menu.contains(e.target)) return
            if (menu) document.body.removeChild(menu)
          }, { once: true })
        })
        .on("mouseover", group_id => {
          highlightGroup(group_id)
        })
        .on("mouseout", () => {
          clearHighlightGroup()
        })
        .on("dblclick", d => {
          this.focus(diagram, d)
        })
      graphics.groupTexts = graphics.groupContainers.append("text")
        .text(d => groups.find(g => g.id === d).name)
        .attr("class", "group-text")
        .on("click", d => {
          if (d3.event.shiftKey) this.focus(diagram, d)
        })
        .on("contextmenu", d => {
          d3.event.preventDefault()
          const x = d3.event.pageX // Cursor X position
          const y = d3.event.pageY // Cursor Y position
          diagram.dom.tooltipDiv.transition()
            .duration(200)
            .style("opacity", 0)
            .style("display", "none")
          // Create a custom menu
          const menu = document.createElement("div")
          menu.style.position = "absolute"
          menu.style.top = `${y}px`
          menu.style.left = `${x}px`
          menu.style.zIndex = 1000
          menu.innerHTML = `<div >View Details</div><div >Deselect Node</div>`

          document.querySelectorAll(".custom-context-menu")
            .forEach(el => el.remove())
          menu.className = "custom-context-menu"

          menu.addEventListener("click", e => {
            if (e.target.innerText === "View Details") {
              this.focus(diagram, d)
            } else if (e.target.innerText === "Deselect Node") {
              Pannels.remove_group(diagram, d)
            }
            document.body.removeChild(menu)
          })

          menu.addEventListener("mouseover", () => {
            highlightGroup(d)
          })

          menu.addEventListener("mouseleave", () => {
            clearHighlightGroup()
          })

          document.body.appendChild(menu)
          document.addEventListener("pointerdown", e => {
            if (menu.contains(e.target)) return
            if (menu) document.body.removeChild(menu)
          }, { once: true })
        })
        .call(d3.drag()
          .on("start", p => {
            if (Utils.inInteractMode() || layer.focusedGroup === p) return null
            if (!d3.event.active) {
              simulations.nodes.alphaTarget(0.7).restart()
              simulations.groups.alphaTarget(0.7).restart()
            }
            dragStart.x = d3.event.x
            dragStart.y = d3.event.y
            groups.find(g => g.id === p).sx = groups.find(g => g.id === p).x
            groups.find(g => g.id === p).sy = groups.find(g => g.id === p).y

            graphics.nodes.filter(d => {
              if (d.group < 0) return false
              return d.group === p || GLOBAL_DATA.groups.find(g => g.id === d.group).parent === p
            })
            .each(d => {
              d.fx = d.sx = d.x
              d.fy = d.sy = d.y
            })
            fixedGroups = this.getFixed(diagram, p)
          })
          .on("drag", p => {
            if (Utils.inInteractMode() || layer.focusedGroup === p) return null
            let fx = groups.find(g => g.id === p).sx - dragStart.x + d3.event.x
            let fy = groups.find(g => g.id === p).sy - dragStart.y + d3.event.y

            graphics.nodes.filter(d => {
              if (d.group < 0) return false
              return d.group === p || GLOBAL_DATA.groups.find(g => g.id === d.group).parent === p
            })
            .each(d => {
              d.fx = d.sx - dragStart.x + d3.event.x
              d.fy = d.sy - dragStart.y + d3.event.y
            })

            groups.find(g => g.id === p).fx = fx
            groups.find(g => g.id === p).fy = fy
          })
          .on("end", p => {
            if (Utils.inInteractMode()) return null
            let group = groups.find(g => g.id === p)

            if (!d3.event.active) {
              simulations.groups.alphaTarget(0)
              simulations.nodes.alphaTarget(0)
            }

            this.update(diagram, layer)
            if (settings.floatMode < 2 || fixedGroups.some(fg => Utils.haveIntersection(diagram, fg, group))) {
              group.fx = null
              group.fy = null
              graphics.nodes.filter(d => d.group === p).each(d => {
                d.fx = null
                d.fy = null
              })
              if (group.hasChildGroup) {
                let childGroups = groups.filter(g => g.parent === p)
                childGroups.forEach(cg => {
                  cg.fx = null
                  cg.fy = null
                })
                graphics.nodes.filter(d => childGroups.some(cg => cg.id === d.group))
                  .each(d => {
                    d.fx = null
                    d.fy = null
                  })
              }
            }
            Layout.save(diagram)
          })
        )
        .on("mouseover", group_id => {
          highlightGroup(group_id)
        })
        .on("mouseout", () => {
          clearHighlightGroup()
        })
        .on("dblclick", d => {
          this.focus(diagram, d)
        })

      layer.dom.groupBordersContainer = layer.dom.layerContainer.append("g")
        .attr("class", "group-borders")

      graphics.groupBorderContainers = dom.groupBordersContainer.selectAll(".group")
        .data(groups.sort((a, b) => a.parent - b.parent).map(({ id }) => id))
        .enter()
      graphics.groupBorders = this.box_border(diagram, graphics.groupBorderContainers)

      graphics.groupCloseBtn = this.closeButton(diagram, dom.groupBordersContainer)
        .attr("style", "display: none")

      layer.dom.tempElements = layer.dom.layerContainer.append("g")
        .attr("class", "temp-elements")
        .style("pointer-events", "none")

      layer.dom.warningElements = layer.dom.layerContainer.append("g")
        .attr("class", "warning-elements")

      this.setup(diagram)
    }
  }

  const Simulations = {
    forces: {
      cluster({ settings, groups }) {
        const strength = 0.2
        let nodes

        function force(alpha) {
          if (!settings.grouping || !groups || groups.length === 0) return
          const l = alpha * strength
          for (const d of nodes) {
            const { cx, cy } = groups.find(g => g.id === d.group) || { cx: 0, cy: 0 }
            if (cx && cy) {
              d.vx -= (d.x - cx) * l
              d.vy -= (d.y - cy) * l
            }
          }
        }

        force.initialize = _ => nodes = _

        return force
      },
      rectCollide(diagram) {
        function constant(_) {
          return function () { return _ }
        }
        let nodes
        let size = constant([0, 0])
        let iterations = 1
        const padding = 100

        function sizes(i) {
          const n = nodes[i]
          return [n.width, n.height]
        }

        function masses(i) {
          const s = sizes(i)
          return s[0] * s[1]
        }

        function force() {
            var node, size, mass, xi, yi
            var i = -1
            while (++i < iterations) { iterate() }

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
                    if (data.index <= node.index) { return }

                    var x = xi - xCenter(data)
                    var y = yi - yCenter(data)
                    var xd = Math.abs(x) - xSize
                    var yd = Math.abs(y) - ySize

                    if (xd < 0 && yd < 0) {
                        var l = Math.sqrt(x * x + y * y)
                        var m = masses(data.index) / (mass + masses(data.index))

                        if (Math.abs(xd) < Math.abs(yd)) {
                            let xDiff = (x *= xd / l * strength) * m
                            if (!Utils.isFixed(diagram, node)) {
                              node.nodes.forEach(n => {
                                n.x -= xDiff
                              })
                            }
                            if (!Utils.isFixed(diagram, data)) {
                              data.nodes.forEach(n => {
                                n.x += x * (1 - m)
                              })
                            }
                        } else {
                            let yDiff = (y *= yd / l * strength) * m
                            if (!Utils.isFixed(diagram, node)) {
                              node.nodes.forEach(n => {
                                n.y -= yDiff
                              })
                            }
                            if (!Utils.isFixed(diagram, data)) {
                              data.nodes.forEach(n => {
                                n.y += y * (1 - m)
                              })
                            }
                        }
                    }
                }

                let collide = x0 > xi + xSize || y0 > yi + ySize ||
                      x1 < xi - xSize || y1 < yi - ySize

                return collide
            }

            function prepare(quad) {
                if (quad.data) {
                    quad.size = sizes(quad.data.index)
                } else {
                    quad.size = [0, 0]
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

        function xCenter(d) { return d.x + d.vx + sizes(d.index)[0] / 2 }
        function yCenter(d) { return d.y + d.vy + sizes(d.index)[1] / 2 }

        force.initialize = function (_) {
          nodes = _
        }

        force.size = function (_) {
            return (arguments.length
                ? (size = typeof _ === "function" ? _ : constant(_), force)
                : size)
        }

        force.strength = function (_) {
            return (arguments.length ? (strength = +_, force) : strength)
        }

        force.iterations = function (_) {
            return (arguments.length ? (iterations = +_, force) : iterations)
        }

        return force
      }
    },
    nodes: {
      create(diagram, layer) {
        const { settings } = diagram
        const { nodes, edges, groups } = layer

        return d3.forceSimulation()
          .nodes(nodes)
          .force("x", d3.forceX().strength(0.1)).force("y", d3.forceY().strength(0.1))
          .force("link", d3.forceLink(edges).id(d => d.name).strength(link => {
            // when not grouping, links should be stronger
            if (!settings.grouping || !groups || groups.length === 0) {
              return 1
              // when grouping, we differentiate between same and not same group links
            } else if (link.source.group === link.target.group) {
              return 0.1
            } else {
              return 0.009
            }
          }))
          .force("cluster", Simulations.forces.cluster(diagram))
          .force("charge", d3.forceManyBody().strength(-3000))
          .alpha(1)
          .alphaTarget(0)
          .on("tick", function() {
            Graphics.update(layer)
          })
      },
      create_trunked(diagram, layer) {
        const { settings } = diagram
        const { nodes, edges, groups } = layer

        const x = d3.scaleOrdinal().domain([0, 1, 2]).range([0, -500, 500])
        const y = d3.scaleOrdinal().domain([0, 1, 2]).range([0, 1, 1])

        return d3.forceSimulation()
          .nodes(nodes)
          .force("x", d3.forceX().strength(0.1).x(d => x(d.displayGroup)))
          .force("y", d3.forceY().strength(d => y(d.displayGroup)).y(0))
          .force("link", d3.forceLink(edges).id(d => d.name).strength(0.01).distance(450))
          .force("charge", d3.forceManyBody().strength(-300)) // Stronger repulsion between nodes
          .force("collision", d3.forceCollide().radius(25)) // Prevent node collapse with collision radius
          .velocityDecay(0.5) // Slow down node movement
          .alphaDecay(0.02) // Stop simulation faster after stabilizing
          .alphaMin(0.01)
          .alpha(1)
          .on("tick", function () {
            Graphics.update(layer)
          })
      }
    },
    groups: {
      create(diagram, layer) {
        const { groups } = layer

        groups.forEach(group => {
          let nodes = layer.graphics.nodes.filter(d => d.group === group.id)
          group.nodeCount = nodes.size()
          if (group.hasChildGroup) {
            let childGroups = groups.filter(g => g.parent === group.id)
            let childNodes = layer.graphics.nodes.filter(d => childGroups.some(cg => cg.id === d.group))
            group.nodeCount += childNodes.size()
          }
        })
        return d3.forceSimulation()
          .alpha(1)
          .alphaTarget(0)
          .force("x", d3.forceX(1000).strength(d => {
            const nodeCount = d.nodeCount || 1
            return 0.1 * GLOBAL_WEIGHT / nodeCount
          }))
          .force("y", d3.forceY(1000).strength(d => {
            const nodeCount = d.nodeCount || 1
            return 0.1 * GLOBAL_WEIGHT / nodeCount
          }))
          .force("collision", Simulations.forces.rectCollide(diagram))
          .nodes(groups.filter(group => group.parent < 0))
          .on("tick", () => {
            Grouping.update(diagram, layer)
          })
      }
    },
    drag(diagram, layer) {
      let bounds
      let fixedGroups = []

      function dragstarted(d) {
        const { simulations, settings, focusedGroup, groups } = diagram
        if (Utils.inInteractMode()) return null

        if (!d3.event.active) {
          simulations.nodes.alphaTarget(0.7).restart()
          if (settings.grouping && simulations.groups) {
            simulations.groups.alphaTarget(0.7).restart()
          }
        }

        d.fx = d.x
        d.fy = d.y

        if (focusedGroup > -1) {
          groups.find(g => g.id === focusedGroup).locked = true
          bounds = groups.find(g => g.id === focusedGroup)
          bounds = {
            x: [bounds.x + settings.groupPadding, bounds.x + bounds.width - settings.groupPadding],
            y: [bounds.y + settings.groupPadding, bounds.y + bounds.height - settings.groupPadding]
          }
        } else {
          bounds = null
        }

        fixedGroups = Grouping.getFixed(diagram, d.group)
      }

      function dragged(d) {
        if (Utils.inInteractMode()) return null
        if (!bounds || (d3.event.x > bounds.x[0] && d3.event.x < bounds.x[1])) d.fx = d3.event.x
        if (!bounds || (d3.event.y > bounds.y[0] && d3.event.y < bounds.y[1])) d.fy = d3.event.y
      }

      function dragended(d) {
        if (Utils.inInteractMode()) return null
        const { groups, simulations, settings } = diagram
        const group = groups ? groups.find(g => g.id === d.group) : null

        if (!d3.event.active) {
          if (simulations.groups) simulations.groups.alphaTarget(0)
          simulations.nodes.alphaTarget(0)
        }

        if (groups) Grouping.update(diagram, layer)

        if (settings.floatMode < 2 || fixedGroups.some(fg => Utils.haveIntersection(diagram, fg, group))) {
          d.fx = null
          d.fy = null
        }
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
      if (layer.groups && layer.groups.length > 0) {
        layer.simulations.groups = Simulations.groups.create(diagram, layer)
      }
    },
    init_trunked(diagram) {
      const layer = diagram.layers[0]

      layer.simulations = {
        nodes: Simulations.nodes.create_trunked(diagram, layer)
      }
      if (layer.groups && layer.groups.length > 0)
        layer.simulations.groups = Simulations.groups.create(diagram, layer)
    },
    teardown({ simulations }) {
      Object.keys(simulations).forEach(key => {
        simulations[key].stop()
        delete simulations[key]
      })
    },
    stop({ simulations }) {
      if (simulations) Object.values(simulations).forEach(simulation => simulation.stop())
    }
  }

  const Graphics = {
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
    update({ focusedGroup, groups, graphics }) {
      if (groups && focusedGroup > -1) {
        const group = groups.find(g => g.id === focusedGroup)
        group.nodes.forEach(d => {
          if (d.x < group.bounds.x[0]) {
            d.x = group.bounds.x[0]
          } else if (d.x > group.bounds.x[1]) {
            d.x = group.bounds.x[1]
          }
          if (d.y < group.bounds.y[0]) {
            d.y = group.bounds.y[0]
          } else if (d.y > group.bounds.y[1]) {
            d.y = group.bounds.y[1]
          }
        })
      }

      graphics.links
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)
      graphics.nodes.attr("transform", d => `translate(${d.x}, ${d.y})`)

      if (graphics.tempLinks && graphics.tempNodes) {
        graphics.tempLinks
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y)
        graphics.tempNodes.attr("transform", d => `translate(${d.x}, ${d.y})`)
      }
    },
    create(diagram, layer) {
      const graphics = diagram.graphics = {}
      const { dom, edges, nodes, settings } = diagram

        /**
         * @function showTooltipAt
         * @param {string} target=('target'|'coords')
         * @param {Event} event
         * @returns void
         */
        const showTooltipAt = _.throttle((target, event) => {
            const containerOffset = dom.container.node().getBoundingClientRect()
            let left = -containerOffset.left
            let top = 0
            if (target === 'target') {
                const pos = event.target.getBoundingClientRect()
                left += pos.left + pos.width
                top += pos.top
            }
            if (target === 'coords') {
                left += event.pageX + 10
                top += event.pageY
            }
            top += settings.toolbar ? -10 : 10
            dom.tooltipDiv.style('left', `${left}px`).style('top', `${top}px`).style('z-index', 9999)
        }, 50, { trailing: false })

        const showAllLinkstoNode = _.throttle(d => {
          graphics.links.filter(link => {
            return !(link.source.name === d.name || link.target.name === d.name)
          })
          .attr("opacity", 0.1)

          if (FOCUSED_GROUP_ID > -1) {
            graphics.links.filter(link =>
              link.source.group !== FOCUSED_GROUP_ID &&
              link.target.group !== FOCUSED_GROUP_ID &&
              GLOBAL_DATA.groups.find(g => g.id === link.source.group)?.parent !== FOCUSED_GROUP_ID &&
              GLOBAL_DATA.groups.find(g => g.id === link.target.group)?.parent !== FOCUSED_GROUP_ID
            )
            .attr("opacity", 0)
          }
        })

        const clearAllLinkstoNode = _.throttle(() => {
          graphics.links.attr("opacity", 1)
          if (FOCUSED_GROUP_ID > -1) {
            graphics.links.filter(link => link.source.group !== FOCUSED_GROUP_ID && link.target.group !== FOCUSED_GROUP_ID)
              .attr("opacity", 0)
            //
            // if (FOCUSED_GROUP_ID > -1) {
            //   graphics.links.filter(link => link.source.group !== FOCUSED_GROUP_ID && link.target.group !== FOCUSED_GROUP_ID)
            //     .attr("opacity", 0)
            // }
          }
        })

        const setFilterForHoveredItem = _.throttle(d => {
          graphics.links.filter(link => link.index !== d.index)
            .attr("opacity", 0.1)
          if (FOCUSED_GROUP_ID > -1) {
            graphics.links.filter(link =>
              link.source.group !== FOCUSED_GROUP_ID &&
              link.target.group !== FOCUSED_GROUP_ID &&
              GLOBAL_DATA.groups.find(g => g.id === link.source.group)?.parent !== FOCUSED_GROUP_ID &&
              GLOBAL_DATA.groups.find(g => g.id === link.target.group)?.parent !== FOCUSED_GROUP_ID
            )
            .attr("opacity", 0)
          }
        })

        const clearFilterForHoveredItem = _.throttle(() => {
          graphics.links.attr("opacity", 1)

          if (FOCUSED_GROUP_ID > -1) {
            graphics.links.filter(link =>
              link.source.group !== FOCUSED_GROUP_ID &&
              link.target.group !== FOCUSED_GROUP_ID &&
              GLOBAL_DATA.groups.find(g => g.id === link.source.group)?.parent !== FOCUSED_GROUP_ID &&
              GLOBAL_DATA.groups.find(g => g.id === link.target.group)?.parent !== FOCUSED_GROUP_ID
            )
            .attr("opacity", 0)
          }
        })

      //controls all link drawing and formatting
      edges.forEach(edge => {
        // Add a new property to randomly chosen edge
        edge.isDetermined = Math.random() <= 0.8
      })
      graphics.links = layer.dom.layerContainer.selectAll("line")
        .data(edges)
        .enter().append("line")
        .attr("stroke", d => {
          if (d.isStaticWan) {
            return "black"
          } else if (d.warning) {
            return "red"
          } else {
            if (d.isDetermined) return "green"
            return "gray"
          }
        })
        .attr("stroke-width", d => {
          return Math.min(d.width, 30)
        })
        .on("mouseover", d => {
          if (FOCUSED_GROUP_ID > -1 && d.source.group !== FOCUSED_GROUP_ID) return

          if (graphics.tempGroupExisted) return
          setFilterForHoveredItem(d)
          if (d.isSummarized || d.isTrunked) {
            dom.tooltipDiv.transition()
              .duration(200)
              .style("opacity", 1)
              .style("display", "block")

            const preTip = !d.isDetermined ? 'Undetermined status\n\n' : ''
            dom.tooltipInner.html(`${preTip}${d.totalSubnets} Aggregated ${d.isSummarized ? "Subnets" : "Networks"}`)
            showTooltipAt("coords", d3.event)
            return
          }
            if (d.QoS || !d.isStaticWan) {
                dom.tooltipDiv.transition()
                    .duration(200)
                    .style('opacity', 1)
                    .style('display', 'block')

                const parts = [d.intDescription, d.ipAddress, (d.mask ?? d.target.mask), Data.downScaleBandwidth(d.bandwidth)]
                if (d.QoS) parts.push(d.QoS)
                const preTip = !d.isDetermined ? 'Undetermined status\n\n' : ''
                dom.tooltipInner.html(preTip + parts.join("<br>"))
                showTooltipAt('coords', d3.event)
            }
        })
        .on("mouseout", () => {
          clearFilterForHoveredItem()
          dom.tooltipDiv.transition()
            .duration(200)
            .style("opacity", 0)
            .style("display", "none")
        })
        .on("click", async d => {
          //only clickable if in interactive mode
          if (Utils.inInteractMode()) {
            if (d.isSummarized) {
              const subnets_data = await Utils.getSummarizedSubnets(d.source)
              const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
              Simulations.init(diagram, layer)
              Graphics.update(layer)
              const group = Grouping.fromNodes(diagram, subnets_data.nodes)
              setTimeout(async () => {
                Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
                await Zoom.focusOnArea(diagram, group)
                // Zoom.restrictArea(layer)
                // layer.zoomBehavior.scaleExtent([layer.transform.k, diagram.settings.maxZoomIn])
              }, 500)
              layer.processing = false
            } else if (d.isTrunked) {
              const subnets_data = await Utils.getTrunkedSubnets(d.source, d.target)
              const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
              Simulations.init_trunked(diagram, layer)
              Graphics.update(layer)
              const group = Grouping.fromNodes(diagram, subnets_data.nodes)
              setTimeout(async () => {
                Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
                await Zoom.focusOnArea(diagram, group)
              }, 500)

              layer.processing = false
            } else {
              window.location.assign(d.url)
            }
          }
        })
        .on("dblclick", async d => {
          if (d.isSummarized) {
            const subnets_data = await Utils.getSummarizedSubnets(d.source)
            const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
            Simulations.init(diagram, layer)
            Graphics.update(layer)
            const group = Grouping.fromNodes(diagram, subnets_data.nodes)
            setTimeout(async () => {
              Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
              await Zoom.focusOnArea(diagram, group)
              // Zoom.restrictArea(layer)
              // layer.zoomBehavior.scaleExtent([layer.transform.k, diagram.settings.maxZoomIn])
            }, 500)
            layer.processing = false
          } else if (d.isTrunked) {
            const subnets_data = await Utils.getTrunkedSubnets(d.source, d.target)
            const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
            Simulations.init_trunked(diagram, layer)
            Graphics.update(layer)
            const group = Grouping.fromNodes(diagram, subnets_data.nodes)
            setTimeout(async () => {
              Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
              await Zoom.focusOnArea(diagram, group)
            }, 500)

            layer.processing = false
          }
        })

      function updateLineAndNodeColors() {
        const Rand = parseInt(Math.random() * 100)
        const warningLines = []
        edges.forEach(edge => {
          if (edge.index === Rand % 37) {
            warningLines.push(edge)
          }
        })
        if (document.querySelector(".warning-elements")) {
            document.querySelector(".warning-elements").innerHTML = ""
        }
        graphics.warningElements = layer.dom.warningElements.selectAll("image")
          .data(warningLines)
          .enter().append("image")
          .attr("href", "assets/graphics/warning.png")
          .attr("height", 64)
          .attr("width", 64)
          .attr("x", d => (d.source.x + d.target.x) / 2 - 32)
          .attr("y", d => (d.source.y + d.target.y) / 2 -40)

        if (document.getElementById("sound_check").checked) {
          const audio = new Audio('assets/sounds/down.mp3')
          audio.play()
        }

        graphics.links.transition()
          .duration(500)
          .attr("stroke", d => {
            if (d.index === Rand % 37) {
              return "black"
            }
            if (d.index === Rand || d.index === Rand % 13 || d.index === Rand % 29) {
              return "red"
            }
            if (d.isStaticWan) {
              return "black"
            } else if (d.warning) {
              return "red"
            } else {
              if (d.isDetermined) return "green"
              return "gray"
            }
          })

        graphics.nodes.selectAll("circle")
          .filter(d => d.status === 0 || d.status === 1)
          .transition()
          .duration(500) // Optional: Add a transition for smooth updates
          .attr("r", 40)
          .attr("fill", d => {
            if (d.index === Rand || d.index === Rand % 13 || d.index === Rand % 29) {
              return "red"
            }
            return "grey"
            // if (d.status === 0) {
            //   return "grey"
            // }
            // return "red"
          })
          .attr("opacity", 0.6)

        if (graphics.tempNodes) {
          graphics.tempNodes.selectAll("circle")
            .filter(d => d.status === 0 || d.status === 1)
            .transition()
            .duration(500) // Optional: Add a transition for smooth updates
            .attr("r", 40)
            .attr("fill", d => {
              if (d.index === Rand || d.index === Rand % 13 || d.index === Rand % 29) {
                return "red"
              }
              return "grey"
              // if (d.status === 0) {
              //   return "grey"
              // }
              // return "red"
            })
            .attr("opacity", 0.6)
        }
      }

      setInterval(updateLineAndNodeColors, 5000)

      // controls all node drawing and formatting
      graphics.nodes = layer.dom.layerContainer.selectAll(".node")
        .data(nodes)
        .enter().append("g")
        .on("mouseover", function(d) {
          showAllLinkstoNode(d)
          if (d.isSummarized) {
            dom.tooltipDiv.transition()
              .duration(200)
              .style("opacity", 1)
              .style("display", "block")
            dom.tooltipInner.html(`${d.totalSubnets} Aggregated Subnets`)
            showTooltipAt("target", d3.event)
            return
          }
          // only show tooltips for the current layer
            const parts = []

          dom.tooltipDiv.transition()
            .duration(200)
            .style("opacity", 1)
            .style("display", "block")

          if (d.isUnmanaged) {
              parts.push(d.name)
          } else if (d.isCloud) {
              parts.push(`Subnet: ${d.subnet}`, `Mask: ${d.mask}`)
          } else {
            if (d.manufacturer || d.model || d.softwareOS) {
                parts.push(d.ipAddress, d.manufacturer, d.model, d.softwareOS, d.location)
            } else {
                parts.push('n/a')
            }
          }
          dom.tooltipInner.html(parts.join('<br>'))
          showTooltipAt('target', d3.event)
        })
        .on("mouseout", function(d) {
          clearAllLinkstoNode(d)
          dom.tooltipDiv.transition()
            .duration(200)
            .style("opacity", 0)
            .style("display", "none")

          if (d.isCloud) {
            d3.select(this).select("circle").transition().attr("r", 0)
          }
        })
        .on("click", async d => {
          if (Utils.inInteractMode()) {
            if (d.isSummarized) {
              const subnets_data = await Utils.getSummarizedSubnets(d.source)
              const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
              Simulations.init(diagram, layer)
              Graphics.update(layer)
              const group = Grouping.fromNodes(diagram, subnets_data.nodes)
              setTimeout(async () => {
                Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
                await Zoom.focusOnArea(diagram, group)
              }, 500)

              layer.processing = false
            } else {
              Layers.drillDown.do(diagram, d)
            }
          }
        })
        .on("dblclick", async d => {
          if (d.isSummarized) {
            const subnets_data = await Utils.getSummarizedSubnets(d.source)
            const layer = await Layers.push_subnets(d.source, d.target, diagram, subnets_data)
            Simulations.init(diagram, layer)
            Graphics.update(layer)
            const group = Grouping.fromNodes(diagram, subnets_data.nodes)
            setTimeout(async () => {
              Grouping.polygonGenerator(diagram, group, subnets_data.nodes)
              await Zoom.focusOnArea(diagram, group)
            }, 500)

            layer.processing = false
          }
          else {
            Layers.drillDown.do(diagram, d)
          }
        })
        .on("contextmenu", d => {
          d3.event.preventDefault()
          const x = d3.event.pageX // Cursor X position
          const y = d3.event.pageY // Cursor Y position
          dom.tooltipDiv.transition()
            .duration(200)
            .style("opacity", 0)
            .style("display", "none")
          // Create a custom menu
          const menu = document.createElement("div")
          menu.style.position = "absolute"
          menu.style.top = `${y}px`
          menu.style.left = `${x}px`
          menu.style.zIndex = 1000
          menu.innerHTML = `<div>View Details</div><div>Deselect Node</div>`

          document.querySelectorAll(".custom-context-menu")
            .forEach(el => el.remove())
          menu.className = "custom-context-menu"

          menu.addEventListener("click", e => {
            if (e.target.innerText === "View Details") {
              Layers.drillDown.do(diagram, d)
            } else if (e.target.innerText === "Deselect Node") {
              Pannels.remove_node(diagram, d)
            }
            document.body.removeChild(menu)
          })
          menu.addEventListener("mouseover", () => {
            showAllLinkstoNode(d)
          })
          menu.addEventListener("mouseout", () => {
            clearAllLinkstoNode(d)
          })

          document.body.appendChild(menu)
          document.addEventListener("pointerdown", e => {
            if (menu.contains(e.target)) return
            if (menu) document.body.removeChild(menu)
          }, { once: true })
        })
        .call(Simulations.drag(diagram, layer))

      //circle for node
      graphics.nodes.append("circle")
        .filter(d => d.status === 0 || d.status === 1)
        .attr("r", 40)
        .attr("fill", d => (d.status === 0 ? "grey" : "red"))
        .attr("opacity", 0.6)

      //attach image to node
      graphics.nodes.append("image")
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

      //controls the labels for each node
      graphics.nodes.append("text")
        .style("font-size", d => d.isCloud ? "13px" : "16px")
        .style("fill", "black")
        .style("font-family", "Arial, Helvetica, sans-serif")
        .attr("text-anchor", "middle")
        .attr("dy", d => {
          const dy = 45
          return d.isCloud ? (dy * 0.1) : dy
        })
        .text(d => {
          if (d.isUnmanaged) {
            return ""
          } else if (d.isCloud) {
            if (Data.inPubInt(d.subnet) && Data.onlyHasOneDev(diagram, d.subnet)) {
              if (d.isSummarized) return `${d.totalSubnets} Subnets`
              return "Internet"
            }
            return d.subnet
          } else {
            return d.name
          }
        })
    }
  }

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

      switch(splitSubnet[0]) {
        case "10":
          return false
        case "169":
          return splitSubnet[1] !== "254"
        case "172":
          return !(parseInt(splitSubnet[1]) > 15 && parseInt(splitSubnet[1]) < 32)
        case "192":
          return splitSubnet[1] !== "168"
        default:
          return true
      }
    },
    onlyHasOneDev({ edges }, sub) {
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
    process(layer, graph, first = false) {
      const { autocompleteItems } = layer

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

      // graph.subnets.forEach(subnet => subnet.group = -1);
      const nodes = graph.devices.concat(graph.subnets)
      const edges = Utils.removeDuplicatedLinks(graph.links) ?? []
      const groups = graph.groups?.map((name, i) => ({
          id: i,
          name,
          title_width: Utils.getTextWidth(name),
          parent: name === "Internet" ? 1 : -1,
          hasChildGroup: name === "City Hall",
        }))
      edges.forEach(edge => {
        const source = _.find(nodes, d => d.name === edge.source)
        const target = _.find(nodes, d => d.name === edge.target)

        if (source) edge.source = source
        if (target) edge.target = target

        if (groups) {
          if (
            source.hasOwnProperty("group") &&
            !target.hasOwnProperty("group")
          ) {
            target.group = source.group
          } else if (
            source.hasOwnProperty("group") &&
            target.hasOwnProperty("group") &&
            source.group !== target.group
          ) {
            if (source.isCloud) source.group = -1
            if (target.isCloud) target.group = -1
          }
        }

        edge.width = edge.isStaticWan ? 5 : Graphics.getLinkWidth(edge.bandwidth)
      })

      nodes.forEach(node => {
        if (!node.hasOwnProperty("group")) {
          node.group = -1
        }
      })

      const filtered_nodes = nodes?.filter(node => {
        if (!GLOBAL_STATUS.isSet) return true
        return Utils.isNodeVisible(node)
      })
      const filtered_edges = edges?.filter(edge => {
        if (!GLOBAL_STATUS.isSet) return true
        return Utils.isNodeVisible(edge.source) && Utils.isNodeVisible(edge.target)
      })
      const filtered_groups = groups?.filter(group => {
        if (!GLOBAL_STATUS.isSet) return true
        return GLOBAL_STATUS.groups[group.id]
      })
      // Subnet summarization
      const new_nodes = []
      const new_edges = []
      filtered_nodes.forEach(selectedNode => {
        const connected_links = filtered_edges.filter(edge => {
          if (edge.source != selectedNode) return false
          const connected_subnet = edge.target
          const linksConnectedtoSubnet = filtered_edges.filter(edge => edge.target == connected_subnet)
          return linksConnectedtoSubnet.length === 1
        })

        if (connected_links.length > 1) {
          const summarized_subnet = {
            image: "assets/Graphics/summarized-cloud.png",
            isSummarized: true,
            name: selectedNode.name + " - Summarized",
            // name: `${connected_links.length} Subnets`,
            subnet: "0.0.0.0",
            mask: "0.0.0.0",
            isCloud: true,
            group: selectedNode.group,
            totalSubnets: connected_links.length,
            source: selectedNode,
          }

          const summarized_edge = {
            source: selectedNode,
            target: summarized_subnet,
            width: 0,
            bandwidth: 0,
            warning: 0,
            isSummarized: true,
            totalSubnets: connected_links.length,
          }

          connected_links.forEach(connected_link => {
            summarized_edge.width += parseInt(connected_link.width)
            summarized_edge.bandwidth += parseInt(connected_link.bandwidth)
            filtered_edges.splice(filtered_edges.findIndex(edge => edge.ipAddress === connected_link.ipAddress), 1)
            filtered_nodes.splice(filtered_nodes.findIndex(node => node.subnet == connected_link.target.subnet), 1)
          })
          new_edges.push(summarized_edge)
          new_nodes.push(summarized_subnet)
        }
      })
      filtered_nodes.push(...new_nodes)
      filtered_edges.push(...new_edges)

      // Subnet summarization END

      // Trunk summarization
      const new_summarzied_edges = []
      const hiddenSubnets = []
      filtered_nodes.forEach(selectedNode => {
        if (selectedNode.isCloud) {
          const connected_links = filtered_edges.filter(edge => edge.target == selectedNode)
          if (connected_links.length == 2) {
            if (connected_links[0].source.group != connected_links[1].source.group) {
              const edgeKey = Utils.generateEdgeKey(connected_links[0].source.name, connected_links[1].source.name)
              const alreadyExistedEdge = new_summarzied_edges.find(link => link.edgeKey == edgeKey)
              if (!alreadyExistedEdge) {
                new_summarzied_edges.push({
                  edgeKey,
                  source: connected_links[0].source,
                  target: connected_links[1].source,
                  isTrunked: true,
                  name: edgeKey,
                  totalSubnets: 2,
                  width: Math.min(connected_links[0].width, connected_links[1].width),
                })
              } else {
                alreadyExistedEdge.width += Math.min(connected_links[0].width, connected_links[1].width)
                alreadyExistedEdge.totalSubnets += 2
              }
              filtered_edges.splice(filtered_edges.findIndex(edge => edge.ipAddress === connected_links[0].ipAddress), 1)
              filtered_edges.splice(filtered_edges.findIndex(edge => edge.ipAddress === connected_links[1].ipAddress), 1)
              hiddenSubnets.push(selectedNode)
              // nodes.splice(nodes.findIndex(node => node.subnet == selectedNode.subnet), 1)
            }
          }
        }
      })
      filtered_edges.push(...new_summarzied_edges)
      hiddenSubnets.forEach(hiddenSubnet => {
        filtered_nodes.splice(filtered_nodes.findIndex(node => node.subnet === hiddenSubnet.subnet), 1)
      })
      layer.nodes = filtered_nodes
      layer.edges = filtered_edges
      layer.groups = filtered_groups
      // Trunk summarization END
    },
    fetch(url) {
      return new Promise((resolve, reject) => {
        d3.json(url, (error, graph) => {
          if (error) {
            reject(error)
          } else {
            resolve(graph)
          }
        })
      })
    }
  }

  const UI = {
    tabbar: {
      readTabStatus () {
        if (!hasStorage) return false
        GLOBAL_TABS = JSON.parse(localStorage.getItem("DIAGRAM_TABS")) ?? [{ title: "default" }]
        return GLOBAL_TABS
      },
      writeTabStatus () {
        if (!hasStorage) return false
        localStorage.setItem("DIAGRAM_TABS", JSON.stringify(GLOBAL_TABS))
        return true
      },
      writeActiveTab () {
        if (!hasStorage) return false
        localStorage.setItem("DIAGRAM_ACTIVE_TAB", GLOBAL_ACTIVE_TAB ?? "")
        return true
      },
      readActiveTab () {
        if (!hasStorage) return false
        GLOBAL_ACTIVE_TAB = localStorage.getItem("DIAGRAM_ACTIVE_TAB") ?? ""
        return GLOBAL_ACTIVE_TAB
      },
      updateTabs (tabbar, diagram = null) {
        let str = ""
        if (GLOBAL_ACTIVE_TAB == null || GLOBAL_ACTIVE_TAB === "") {
          GLOBAL_ACTIVE_TAB = GLOBAL_TABS[0].title
        }
        let activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)

        if (!activeTab) {
          activeTab = GLOBAL_TABS[0]
          GLOBAL_ACTIVE_TAB = activeTab.title
        }

        this.writeActiveTab()
        if (activeTab && activeTab.status) {
          GLOBAL_STATUS = { ...activeTab.status, isSet: true }
        } else {
          GLOBAL_STATUS = {
            isSet: false,
            groups: [],
            devices: [],
            subnets: [],
          }
        }
        GLOBAL_TABS.forEach(tab => {
          str += `<li class="${tab.title === GLOBAL_ACTIVE_TAB ? "active" : ""} ">
            <button type="button" class="tab">${tab.title}</button>
            <input type="text" class="tab-input" value="${tab.title}" style="display: none; box-shadow: rgb(132 187 215) 0px 3px 8px; margin: 0 2px; border-radius: 4px; border: 1px solid #a1a1a1;">
          </li>`
        })
        tabbar.querySelector(".tab-list").innerHTML = str
        tabbar.querySelectorAll(".tab-list .tab").forEach(tab => {
          tab.addEventListener("click", () => {
            if (GLOBAL_EDIT_STATUS === true && GLOBAL_ACTIVE_TAB === tab.innerText) {
              const tab_input = tab.closest("li").querySelector(".tab-input")
              tab_input.style.display = "block"
              tab_input.focus()
              tab.style.display = "none"
              // When user clicks on outside of tab_input, hide the tab input and show tab
              tab_input.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.keyCode === 13) {
                  if (GLOBAL_TABS.find(tab => tab.title === tab_input.value)) return
                  tab_input.style.display = "none"
                  tab.style.display = "block"
                  GLOBAL_TABS.forEach(tab => {
                    if (tab.title === GLOBAL_ACTIVE_TAB) {
                      tab.title = tab_input.value
                    }
                  })
                  GLOBAL_ACTIVE_TAB = tab_input.value
                  this.writeTabStatus()
                  this.updateTabs(tabbar)
                }
              })
              tab_input.addEventListener("blur", () => {
                tab_input.style.display = "none"
                tab.style.display = "block"
              })
            } else {
              GLOBAL_ACTIVE_TAB = tab.innerText
              this.updateTabs(tabbar, diagram)
            }
          })
        })
        if (diagram) {
          UI.updateFloatModeBar(diagram)
          Layers.refreshLayer(diagram)
        }
      },
      addTab (tabbar, diagram) {
        let index = GLOBAL_TABS.length
        while (GLOBAL_TABS.find(tab => tab.title === `- ${index} -`)) {
          index++
        }
        const title = `- ${index} -`
        GLOBAL_ACTIVE_TAB = title
        GLOBAL_TABS.push({ title: title, floatMode: FLOATMODE.FLOAT_ALL, layout: {} })
        this.updateTabs(tabbar, diagram)
      },
      deleteTab (tabbar, diagram) {
        if (GLOBAL_TABS.length === 1) return
        GLOBAL_TABS = GLOBAL_TABS.filter(tab => tab.title !== GLOBAL_ACTIVE_TAB)
        GLOBAL_ACTIVE_TAB = GLOBAL_TABS[0].title
        this.updateTabs(tabbar, diagram)
      },
      initTabOrderModal (tabbar) {
        var str = `
        <div tabindex="-1" class="modal-mask">
          <div class="modal-dialog" style="width: 250px">
            <div class="modal-content">
              <div class="modal-header">
                <button type="button" class="close tab-order-close">×</button>
                <h2 class="devices-title note">Order tabs</h2>
              </div>
              <div class="modal-body">
                <ul style="list-style-type: none; padding: 0px">
                  <li>
                    <label
                      class="pointer ma-0 w-full"
                      style="border: 1px solid var(--border-block, #ccc);padding: 5px 10px;color: white;background-color: black"
                    ><input type="radio" class="hidden" value="0">
                      - 10 -
                    </label>
                  </li>
                  <li>
                    <label
                      class="pointer ma-0 w-full"
                      style="border: 1px solid var(--border-block, #ccc);padding: 5px 10px;color: black;background-color: white"
                    ><input type="radio" class="hidden" value="1">
                      - 103 -
                    </label>
                  </li>
                </ul>
                <div class="flex gap-2 pb-10">
                  <button type="button" class="btn form-btn relative" disabled="disabled">
                    Up
                    <span
                      class="flex flex-center absolute-cover"
                      style="background-color: inherit; display: none"
                    ><div class="inline-block" style="position: absolute">
                      <div
                        class="vue-simple-spinner"
                        style="
                          margin: 0px auto;
                          border-radius: 100%;
                          border-width: 3px;
                          border-style: solid;
                          border-color: rgb(33, 150, 243) rgb(238, 238, 238) rgb(238, 238, 238);
                          border-image: initial;
                          width: 19px;
                          height: 19px;
                          animation: 0.8s linear 0s infinite normal none running vue-simple-spinner-spin;
                        "
                      ></div>
                      <!---->
                    </div></span>
                  </button>
                  <button type="button" class="btn form-btn relative">
                    Down
                    <span
                      class="flex flex-center absolute-cover"
                      style="background-color: inherit; display: none"
                    ><div class="inline-block" style="position: absolute">
                      <div
                        class="vue-simple-spinner"
                        style="
                            margin: 0px auto;
                            border-radius: 100%;
                            border-width: 3px;
                            border-style: solid;
                            border-color: rgb(33, 150, 243) rgb(238, 238, 238)
                              rgb(238, 238, 238);
                            border-image: initial;
                            width: 19px;
                            height: 19px;
                            animation: 0.8s linear 0s infinite normal none running
                              vue-simple-spinner-spin;
                          "
                      ></div>
                      <!---->
                    </div></span>
                  </button>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn form-btn relative ok-button">
                  OK
                  <span
                    class="flex flex-center absolute-cover"
                    style="background-color: inherit; display: none"
                    ><div class="inline-block" style="position: absolute">
                      <div
                        class="vue-simple-spinner"
                        style="
                          margin: 0px auto;
                          border-radius: 100%;
                          border-width: 3px;
                          border-style: solid;
                          border-color: rgb(33, 150, 243) rgb(238, 238, 238) rgb(238, 238, 238);
                          border-image: initial;
                          width: 19px;
                          height: 19px;
                          animation: 0.8s linear 0s infinite normal none running vue-simple-spinner-spin;
                        "
                      ></div>
                      <!---->
                    </div></span>
                </button>
                <button
                  type="button"
                  class="btn form-btn relative bg-whitesmoke text-black cancel-button"
                >
                  Cancel
                  <span
                    class="flex flex-center absolute-cover"
                    style="background-color: inherit; display: none"
                  ><div class="inline-block" style="position: absolute">
                    <div
                      class="vue-simple-spinner"
                      style="
                        margin: 0px auto;
                        border-radius: 100%;
                        border-width: 3px;
                        border-style: solid;
                        border-color: rgb(33, 150, 243) rgb(238, 238, 238) rgb(238, 238, 238);
                        border-image: initial;
                        width: 19px;
                        height: 19px;
                        animation: 0.8s linear 0s infinite normal none running vue-simple-spinner-spin;
                      "
                    ></div>
                    <!---->
                  </div></span>
                </button>
              </div>
              <img
                src="assets/img/button-up.png"
                title="Scroll to Top"
                alt="to Top"
                class="scroll-to-top hidden-print"
                style="display: none"
              >
            </div>
          </div>
        </div>`
        let modal = document.createElement("div")
        modal.innerHTML = str
        document.body.appendChild(modal)
        modal.classList.add("tab-order-modal")
        modal.style.display = "none"

        const span = document.getElementsByClassName("tab-order-close")[0]
        span.onclick = function () {
          modal.style.display = "none"
        }

        var ok_button = modal.querySelector(".ok-button")
        ok_button.addEventListener("click", () => {
          GLOBAL_SELECTED_TAB = null
          this.writeTabStatus()
          this.updateTabs(tabbar)
          modal.style.display = "none"
        })

        const cancel_button = modal.querySelector(".cancel-button")
        cancel_button.addEventListener("click", () => {
          GLOBAL_SELECTED_TAB = null
          this.readTabStatus()
          modal.style.display = "none"
        })

        const upButton = modal.querySelector(".modal-body .flex button:first-child")
        upButton.addEventListener("click", () => {
          const index = GLOBAL_TABS.findIndex(tab => tab.title === GLOBAL_SELECTED_TAB)
          const temp = GLOBAL_TABS[index]
          GLOBAL_TABS[index] = GLOBAL_TABS[index - 1]
          GLOBAL_TABS[index - 1] = temp
          this.updateOrderModal(tabbar)
        })
        const downButton = modal.querySelector(".modal-body .flex button:last-child")
        downButton.addEventListener("click", () => {
          const index = GLOBAL_TABS.findIndex(tab => tab.title === GLOBAL_SELECTED_TAB)
          const temp = GLOBAL_TABS[index]
          GLOBAL_TABS[index] = GLOBAL_TABS[index + 1]
          GLOBAL_TABS[index + 1] = temp
          this.updateOrderModal(tabbar)
        })
      },
      updateOrderModal (tabbar) {
        const modal = document.querySelector(".tab-order-modal")
        const list = modal.querySelector(".modal-body ul")
        list.innerHTML = ""
        GLOBAL_TABS.forEach(tab => {
          list.innerHTML += `<li>
            <label
              class="pointer ma-0 w-full"
              style="
                border: 1px solid var(--border-block, #ccc);
                padding: 5px 10px;
                color: ${tab.title === GLOBAL_SELECTED_TAB ? "white" : "black"};
                background-color: ${tab.title === GLOBAL_SELECTED_TAB ? "black" : "white"};
              "
            ><input type="hidden" class="hidden" value="${tab.title}">
              ${tab.title}
            </label>
          </li>`
        })
        list.querySelectorAll("li").forEach(li => {
          li.addEventListener("click", () => {
            GLOBAL_SELECTED_TAB = li.querySelector("input").value
            this.updateOrderModal(tabbar)
          })
        })
        const upButton = modal.querySelector(".modal-body .flex button:first-child")
        const downButton = modal.querySelector(".modal-body .flex button:last-child")
        if (GLOBAL_SELECTED_TAB === GLOBAL_TABS[0].title) {
          upButton.disabled = true
          downButton.disabled = false
        } else if (GLOBAL_SELECTED_TAB === GLOBAL_TABS[GLOBAL_TABS.length - 1].title) {
          downButton.disabled = true
          upButton.disabled = false
        } else if (GLOBAL_SELECTED_TAB === undefined) {
          upButton.disabled = true
          downButton.disabled = true
        } else {
          upButton.disabled = false
          downButton.disabled = false
        }
      },
      showOrderTabModal (tabbar) {
        this.updateOrderModal(tabbar)
        document.querySelector(".tab-order-modal").style.display = "block"
      },
      create (diagram) {
        const { dom } = diagram
        const tabbar = (dom.tabbar = document.createElement("div"))
        tabbar.classList.add("tabbar")
        tabbar.innerHTML = `<div class="flex flex-spacebetween flex-align-center border-b" style="margin-bottom: 8px;">
          <div class="flex gap-2">
            <ul class="nav nav-tabs tab-list"></ul>
            <div class="tab-buttons" style="display: none; gap: 0.5rem">
              <button type="button" class="btn-link new-tab">
                New
              </button>
              <button type="button" class="btn-link delete-tab">
                Delete
              </button>
              <button type="button" class="btn-link order-tab">
                Order
              </button>
            </div>
          </div>
          <div class="edit-buttons" style="display:none;">
            <button type="button" class="btn-link save-button">
              Save
            </button>
            |
            <button type="button" class="btn-link load-button">
              Load
            </button> <input type="file" accept=".elements" class="hidden load-input">
            |
            <button type="button" class="btn-link reset-button">
              Reset
            </button>
            |
            <button type="button" class="btn-link lock-button">
              Lock
            </button>
          </div>
          <div class="initial-button">
            <button type="button" class="initial-button btn-link">
              Edit
            </button>
          </div>
        </div>`
        tabbar.querySelector(".initial-button").addEventListener("click", () => {
          GLOBAL_EDIT_STATUS = true
          tabbar.querySelector(".edit-buttons").style.display = "block"
          tabbar.querySelector(".tab-buttons").style.display = "flex"
          tabbar.querySelector(".initial-button").style.display = "none"
        })
        tabbar.querySelector(".lock-button").addEventListener("click", () => {
          GLOBAL_EDIT_STATUS = false
          tabbar.querySelector(".edit-buttons").style.display = "none"
          tabbar.querySelector(".tab-buttons").style.display = "none"
          tabbar.querySelector(".initial-button").style.display = "block"
          this.writeTabStatus()
        })
        // Tab buttons
        tabbar.querySelector(".tab-buttons .new-tab").addEventListener("click", () => {
          this.addTab(tabbar, diagram)
        })
        tabbar.querySelector(".tab-buttons .delete-tab").addEventListener("click", () => {
          if (GLOBAL_TABS.length === 1) return
          if (!confirm(`Are you sure want to remove ${GLOBAL_ACTIVE_TAB} tab?`)) return
          this.deleteTab(tabbar, diagram)
        })
        tabbar.querySelector(".tab-buttons .order-tab").addEventListener("click", () => {
          this.showOrderTabModal(tabbar)
        })
        //
        // tabbar.querySelector(".edit-elements-button").addEventListener("click", () => {
        //   Pannels.showSettingModal(diagram)
        // })
        tabbar.querySelector(".reset-button").addEventListener("click", () => {
          reset(diagram)
        })

        var load_input = tabbar.querySelector(".load-input")
        tabbar.querySelector(".load-button").addEventListener("click", () => {
          load_input.click()
        })
        load_input.addEventListener("change", () => {
          const file = load_input.files[0]
          if (file) {
            const reader = new FileReader()
            reader.onload = function (e) {
              try {
                const content = e.target.result
                const new_status = JSON.parse(content, null, 2)
                const activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)
                if (activeTab) {
                  activeTab.status = { ...new_status }
                  GLOBAL_STATUS = { ...new_status, isSet: true }
                  Layers.refreshLayer(diagram)
                }
              } catch (error) {
                alert(error)
              }
            }
            reader.readAsText(file)
          } else {
            console.log("No file")
          }
        })

        tabbar.querySelector(".save-button").addEventListener("click", () => {
          if (GLOBAL_STATUS) {
            const blob = new Blob([JSON.stringify(GLOBAL_STATUS, null, 2)], { type: "application/json", })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${GLOBAL_ACTIVE_TAB}.elements`
            a.click()
            URL.revokeObjectURL(url)
          }
        })

        this.readTabStatus()
        this.readActiveTab()
        this.updateTabs(tabbar, diagram)
        this.initTabOrderModal(tabbar)
        return tabbar
      }
    },
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
          const { dom } = diagram
          let list
          let currentFocus = -1

          function setActive(items) {
            if (!items) return false
            items[currentFocus].classList.add("autocomplete-active")
          }
          function removeActive(items) {
            if (!items || currentFocus < 0) return false
            items[currentFocus].classList.remove("autocomplete-active")
          }

          input.addEventListener("input", () => {
            const val = input.value
            const items = diagram.autocompleteItems
            if (!val) return false
            if (list) list.remove()
            currentFocus = -1
            list = dom.searchAutocompleteList = document.createElement("div")
            list.setAttribute("class", "autocomplete-items")
            input.parentNode.appendChild(list)
            items.forEach(item => {
              /*check if the item starts with the same letters as the text field value:*/
              if (item.substr(0, val.length).toUpperCase() !== val.toUpperCase()) return
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
      styleModeButtons({ dom, settings }, mode) {
        const modeToggle = document.querySelector(".mode-toggle")
        if (modeToggle) {
          modeToggle.querySelectorAll("g").forEach(modeParent => {
            if (parseInt(modeParent.dataset.id) === mode) {
              modeParent.classList.add("active")
            } else {
              modeParent.classList.remove("active")
            }
          })
        }
      },
      toggle({ dom, settings }) {
        settings.toolbar = !settings.toolbar
        dom.toolbar.style.display = settings.toolbar ? "block" : "none"
      },
      create(diagram) {
        const { dom, settings, autocompleteItems } = diagram
        const toolbar = dom.toolbar = document.createElement("div")
        let mode = FLOATMODE.FLOAT_ALL
        if (GLOBAL_ACTIVE_TAB) {
          const activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)
          if (activeTab && activeTab.floatMode) {
            diagram.settings.floatMode = mode = activeTab.floatMode
          }
        }

        toolbar.classList.add("toolbar")
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
            <g class="button float-all" data-id="${FLOATMODE.FLOAT_ALL}">
              <rect height="100%" width="40px"></rect>
              <text class="button-label float-all" x="4.5" y="13">Float All</text>
            </g>
            <g class="button float" data-id="${FLOATMODE.FLOAT}">
              <rect height="100%" width="40px"></rect>
              <text class="button-label float" x="9.5" y="13">Float</text>
            </g>
            <g class="button lock" data-id="${FLOATMODE.LOCK}">
              <rect height="100%" width="40px"></rect>
              <text class="button-label lock" x="10" y="13">Lock</text>
            </g>
            <g class="button lock-all" data-id="${FLOATMODE.LOCK_ALL}">
              <rect height="100%" width="40px"></rect>
              <text class="button-label lock-all" x="4.5" y="13">Lock All</text>
            </g>
          </svg>
          <div class="button visio-export">
            <img src="assets/img/VisioIcon.png"/>
          </div>
          <div class="button detach">
            <a onclick="openWindow('DiagramDetach.html',1000,600)">Detach</a>
          </div>
          <div class="groupings-toggle" style="display: none">
            <input type="checkbox" />
            <label class="label">Grouping</label>
          </div>
          <div>
              <div style="display: flex">
                <input type="checkbox" id="sound_check">
                <label for="sound_check" style="margin-bottom: 0; margin-left: 5px;">Sound</label>
              </div>
            <audio id="downAudio" src="assets/sounds/down.mp3"></audio>
          </div>
        `

        const searchFormInput = toolbar.querySelector(".search-form input")

        toolbar.querySelector(".zoom-in").addEventListener("click", () => Zoom.increment(diagram))
        toolbar.querySelector(".zoom-out").addEventListener("click", () => Zoom.decrement(diagram))
        toolbar.querySelector(`[data-id='${mode}']`).classList.add("active")
        toolbar.querySelector(".button.float-all").addEventListener("click", () => {
          toggleFloatMode(diagram, FLOATMODE.FLOAT_ALL)
        })
        toolbar.querySelector(".button.float").addEventListener("click", () => {
          toggleFloatMode(diagram, FLOATMODE.FLOAT)
        })
        toolbar.querySelector(".button.lock").addEventListener("click", () => {
          toggleFloatMode(diagram, FLOATMODE.LOCK)
        })
        toolbar.querySelector(".button.lock-all").addEventListener("click", () => {
          toggleFloatMode(diagram, FLOATMODE.LOCK_ALL)
        })
        toolbar.querySelector(".button.visio-export").addEventListener("click", () => doVisioExport(diagram))
        toolbar.querySelector(".button.search").addEventListener("click", () => this.searchForm.search(diagram, searchFormInput.value))

        const groupingToggle = toolbar.querySelector(".groupings-toggle input")
        groupingToggle.checked = settings.grouping
        groupingToggle.addEventListener("click", () => Grouping.toggle(diagram))

        this.searchForm.autocompleteSetup(diagram, searchFormInput, autocompleteItems)
        this.styleModeButtons(diagram)

        // hide if toggled off
        if (!settings.toolbar) toolbar.style.display = "none"

        return toolbar
      }
    },
    sliderbar: {
      create (diagram) {
        const { dom, simulations } = diagram
        const sliderbar = (dom.sliderbar = document.createElement("div"))
        let weight = DIAGRAM_WEIGHT.MIN
        if (GLOBAL_ACTIVE_TAB) {
          const activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)
          if (activeTab) {
            weight = activeTab.weight
          }
        }

        sliderbar.classList.add("sliderbar")
      //   sliderbar.innerHTML += `
      //     <label for="cowbell">Weight: </label>
      //     <input type="range" id="cowbell" name="cowbell" min="0" max="100" value="90" step="5">
      // `
        sliderbar.innerHTML += `
          <button type="button" class="btn-link edit-elements-button">
            Edit Elements
          </button>`
        sliderbar.querySelector(".edit-elements-button").addEventListener("click", () => {
          Pannels.showSettingModal(diagram)
        })
        return sliderbar
      }
    },
    updateFloatModeBar (diagram) {
      const toolbar = document.querySelector(".toolbar")
      if (toolbar) {
        let mode = FLOATMODE.FLOAT_ALL
        if (GLOBAL_ACTIVE_TAB) {
          const activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)
          if (activeTab) {
            diagram.settings.floatMode = mode = activeTab.floatMode
          }
        }
        toolbar.querySelectorAll(".button").forEach(button => {
          button.classList.remove("active")
        })
        toolbar.querySelector(`[data-id='${mode}']`).classList.add("active")
      }
    },
    teardown({ dom }) {
      const containerEl = dom.container.node()

      while (containerEl.firstElementChild) {
        containerEl.firstElementChild.remove()
      }
    },
    loading: {
      start({ dom }) {
        dom.spinner = dom.container.append("rect").attr("class", "loader")
      },
      finish({ dom }) {
        dom.spinner.remove()
      },
    },
    create(diagram, container) {
      const dom = diagram.dom = {}

      dom.container = d3.select(container).classed("diagram", true).classed("widget-mode", Utils.isWidget())
      dom.container.append(() => this.tabbar.create(diagram))
      const toolbarWrapper = dom.container.append("div").attr("class", "toolbar-wrapper")
      toolbarWrapper.append(() => this.toolbar.create(diagram))
      toolbarWrapper.append(() => this.sliderbar.create(diagram))
      dom.visContainer = dom.container.append("div")
        .style("position", "relative")
        .style("width", "100%")
        .style("height", "100%")
        .attr("class", "grabbable")
      dom.tooltipDiv = dom.container
        .append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
        .style("z-index", -1)
      dom.tooltipInner = dom.tooltipDiv
        .append("div")
        .style("white-space", "pre-line")
        .attr("class", "tooltip-inner")
    }
  }

  const Pannels = {
    init (diagram) {
      let modal = document.createElement("div")
      modal.classList.add("setting-modal-container")
      var str = `
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
      GLOBAL_DATA.groups.forEach(group => {
        str += `
              <li class="tree-item group">
                <div class="tree-title group">
                  <span class="toggle">▶</span>
                  <input type="checkbox" class="group-checkbox" ${GLOBAL_STATUS.groups[group.id] ? "checked" : ""} data-id=${group.id}>
                  ${group.name}
                </div>
                <ul class="children">`
        GLOBAL_DATA.devices.forEach(device => {
          if (device.group == group.id) {
            str += `
                  <li class="tree-item device">
                    <div class="tree-title device">
                      <input type="checkbox" class="device-checkbox" ${GLOBAL_STATUS.devices[device.id] ? "checked" : ""} data-id=${device.id}>
                      ${device.name}
                    </div>
                  </li>`
          }
        })
        GLOBAL_DATA.subnets.forEach(subnet => {
          if (subnet.group == group.id) {
            str += `
                  <li class="tree-item subnet">
                    <div class="tree-title subnet">
                      <input type="checkbox" class="subnet-checkbox" ${GLOBAL_STATUS.subnets[subnet.id] ? "checked" : ""} data-id=${subnet.id}>
                      ${subnet.subnet}
                    </div>
                  </li>`
          }
        })
        str += `</ul></li>`
      })

      GLOBAL_DATA.subnets.forEach(subnet => {
        if (subnet.group === -1) {
          str += `
                <li class="tree-item subnet">
                  <div class="tree-title subnet">
                    <input type="checkbox" class="subnet-checkbox" ${GLOBAL_STATUS.subnets[subnet.id] ? "checked" : ""} data-id=${subnet.id}>
                    ${subnet.subnet}
                  </div>
                </li>`
        }
      })
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

      document.querySelectorAll(".toggle").forEach(toggle => {
        toggle.addEventListener("click", () => {
          const parent = toggle.parentElement
          parent.parentElement.classList.toggle("expanded")
          toggle.textContent = parent.parentElement.classList.contains("expanded") ? "▼" : "▶"
        })
      })

      document.querySelectorAll(".group-checkbox").forEach(groupCheckbox => {
        groupCheckbox.addEventListener("change", () => {
          const childrenCheckboxes = groupCheckbox.closest(".tree-item").querySelectorAll(".device-checkbox, .subnet-checkbox")
          childrenCheckboxes.forEach(childCheckbox => (childCheckbox.checked = groupCheckbox.checked))
        })
      })

      document.querySelectorAll(".device-checkbox, .subnet-checkbox").forEach(deviceCheckbox => {
        deviceCheckbox.addEventListener("change", () => {
          const parentGroupCheckbox = deviceCheckbox.closest(".tree-item.group").querySelector(".group-checkbox")

          if (!deviceCheckbox.checked) {
            const all_children = Array.from(deviceCheckbox.closest(".tree-item.group").querySelectorAll(".device-checkbox, .subnet-checkbox"))

            if (all_children.every(childCheckbox => childCheckbox.checked === false)) {
              parentGroupCheckbox.checked = false
            }
          } else {
            parentGroupCheckbox.checked = true
          }
        })
      })

      document.querySelectorAll(".subnet-checkbox").forEach(subnetCheckbox => {
        subnetCheckbox.addEventListener("change", () => {
          const dataId = subnetCheckbox.dataset.id
          document.querySelectorAll(`.subnet-checkbox[data-id="${dataId}"]`).forEach(sameCheckbox => (sameCheckbox.checked = subnetCheckbox.checked))
        })
      })

      var span = document.getElementsByClassName("setting-close")[0]
      span.onclick = function () {
        modal.style.display = "none"
      }

      var select_all_btn = document.getElementsByClassName("action_select_all")[0]
      select_all_btn.onclick = function () {
        document.getElementsByClassName("tree")[0].querySelectorAll(".group-checkbox, .device-checkbox, .subnet-checkbox")
          .forEach(checkbox => (checkbox.checked = true))
      }

      var deselect_all_btn = document.getElementsByClassName("action_deselect_all")[0]
      deselect_all_btn.onclick = function () {
        document.getElementsByClassName("tree")[0].querySelectorAll(".group-checkbox, .device-checkbox, .subnet-checkbox")
          .forEach(checkbox => (checkbox.checked = false))
      }

      var resetSetting = document.getElementsByClassName("setting-reset")[0]
      resetSetting.onclick = function () {
        Pannels.update()
      }

      var confirmSetting = document.getElementsByClassName("setting-confirm")[0]
      confirmSetting.onclick = function () {
        Pannels.applySettings(diagram)
        modal.style.display = "none"
      }
      var cancelSetting = document.getElementsByClassName("setting-cancel")[0]
      cancelSetting.onclick = function () {
        modal.style.display = "none"
      }

      var searchInput = document.getElementsByClassName("search-input")[0]
      var clearButton = document.getElementById("clear-button")

      searchInput.addEventListener("change", () => {
        Pannels.search(searchInput.value)
      })

      clearButton.onclick = function () {
        searchInput.value = ""
        Pannels.search("")
      }

      var searchBtn = document.getElementsByClassName("element-search")[0]
      searchBtn.onclick = function () {
        Pannels.search(searchInput.value)
      }
    },
    search (searchString) {
      if (searchString === "") {
        document.querySelectorAll(".tree-item").forEach(item => {
          item.style.display = "block"
          item.classList.remove("expanded")
        })
        return
      }

      document.querySelectorAll(".tree-item").forEach(item => {
        item.style.display = "none"
      })

      const searchValue = searchString.toLowerCase()

      const tree = document.querySelector(".tree")
      const groups = tree.querySelectorAll(".tree-item.group")

      groups.forEach(group => {
        const title = group.querySelector(".tree-title").textContent
        if (title.toLowerCase().includes(searchValue)) {
          group.style.display = "block"
          group.classList.add("expanded")
          group.querySelectorAll(".tree-item").forEach(item => {
            item.style.display = "block"
          })
        } else {
          let should_group_displayed = false
          group.querySelectorAll(".tree-item").forEach(item => {
            if (item.querySelector(".tree-title").textContent.toLowerCase().includes(searchValue)) {
              item.style.display = "block"
              should_group_displayed = true
            }
          })
          if (should_group_displayed) {
            group.classList.add("expanded")
            group.style.display = "block"
          }
        }
      })

      const isolated_subnets = tree.querySelectorAll("> .tree-item.subnet")
      isolated_subnets.forEach(subnet => {
        if (subnet.querySelector(".tree-title").textContent.toLowerCase().includes(searchValue)) {
          subnet.style.display = "block"
        }
      })
    },
    update () {
      document.querySelectorAll(".group-checkbox").forEach(checkbox => {
        checkbox.checked = GLOBAL_STATUS.isSet ? GLOBAL_STATUS.groups[checkbox.dataset.id] : true
      })

      document.querySelectorAll(".device-checkbox").forEach(checkbox => {
        checkbox.checked = GLOBAL_STATUS.isSet ? GLOBAL_STATUS.devices[checkbox.dataset.id] : true
      })

      document.querySelectorAll(".subnet-checkbox").forEach(checkbox => {
        checkbox.checked = GLOBAL_STATUS.isSet ? GLOBAL_STATUS.subnets[checkbox.dataset.id] : true
      })
    },
    showSettingModal () {
      Pannels.update()
      var modal = document.getElementsByClassName("setting-modal-container")[0]
      modal.style.display = "flex"
      document.querySelectorAll(".tree-item").forEach(item => {
        item.style.display = "block"
        item.classList.remove("expanded")
      })
    },
    remove_node (diagram, d) {
      if (d.isCloud) {
        GLOBAL_STATUS.subnets[d.id] = false
      } else {
        GLOBAL_STATUS.devices[d.id] = false
      }

      const all_devices_in_group = GLOBAL_DATA.devices.filter(device => device.group == d.group)
      const all_subnets_in_group = GLOBAL_DATA.subnets.filter(subnet => subnet.group == d.group)
      let should_group_displayed = false
      all_devices_in_group.forEach(device => {
        if (GLOBAL_STATUS.devices[device.id]) should_group_displayed = true
      })
      all_subnets_in_group.forEach(subnet => {
        if (GLOBAL_STATUS.subnets[subnet.id]) should_group_displayed = true
      })
      GLOBAL_STATUS.groups[d.group] = should_group_displayed

      const activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)
      if (activeTab) {
        activeTab.status = { ...GLOBAL_STATUS }
      }
      UI.tabbar.writeTabStatus()
      Layers.refreshLayer(diagram)
    },
    remove_group (diagram, d) {
      const all_devices_in_group = GLOBAL_DATA.devices.filter(device => device.group == d)
      const all_subnets_in_group = GLOBAL_DATA.subnets.filter(subnet => subnet.group == d)
      all_devices_in_group.forEach(device => {
        GLOBAL_STATUS.devices[device.id] = false
      })
      all_subnets_in_group.forEach(subnet => {
        GLOBAL_STATUS.subnets[subnet.id] = false
      })
      GLOBAL_STATUS.groups[d] = false

      const activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)
      if (activeTab) {
        activeTab.status = { ...GLOBAL_STATUS }
      }
      UI.tabbar.writeTabStatus()
      Layers.refreshLayer(diagram)
    },
    applySettings (diagram) {
      const activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)
      if (activeTab) {
        activeTab.status = { ...GLOBAL_STATUS }
      }
      GLOBAL_STATUS.isSet = true
      document.querySelectorAll(".group-checkbox").forEach(groupCheckbox => {
        GLOBAL_STATUS.groups[groupCheckbox.dataset.id] = groupCheckbox.checked
      })

      document.querySelectorAll(".device-checkbox").forEach(deviceCheckbox => {
        GLOBAL_STATUS.devices[deviceCheckbox.dataset.id] = deviceCheckbox.checked
      })

      document.querySelectorAll(".subnet-checkbox").forEach(subnetCheckbox => {
        GLOBAL_STATUS.subnets[subnetCheckbox.dataset.id] = subnetCheckbox.checked
      })
      UI.tabbar.writeTabStatus()
      Layers.refreshLayer(diagram)
    }
  }

  function doVisioExport({ nodes, edges, groups, focusedGroup }) {
    let data
    let name = "TotalView Diagram-"

    if (focusedGroup > -1) {
      data = {
        nodes: nodes.filter(n => n.group === focusedGroup),
        edges: edges.filter(e => e.source.group === focusedGroup && e.target.group === focusedGroup),
        GLOBAL_DATA: GLOBAL_DATA,
      }
      name += groups[focusedGroup].name
    } else {
      data = { nodes, edges, groups, GLOBAL_DATA }
      name += "Main"
    }
    visioExport.generate(data, name)
  }

  function toggleFloatMode(diagram, mode) {
    diagram.settings.floatMode = mode
    UI.toolbar.styleModeButtons(diagram, mode)
    if (GLOBAL_ACTIVE_TAB) {
      const activeTab = GLOBAL_TABS.find(tab => tab.title === GLOBAL_ACTIVE_TAB)
      if (activeTab) {
        activeTab.floatMode = mode
      }
    }
    UI.tabbar.writeTabStatus()
    const { currentLayer } = diagram
    if (mode === FLOATMODE.FLOAT_ALL) {
      diagram.graphics.nodes.each(d => {
        d.fx = null
        d.fy = null
      })
      currentLayer.groups.forEach(g => {
        g.fx = null
        g.fy = null
      })
    } else if (mode === FLOATMODE.LOCK_ALL) {
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
  }

  const Layers = {
    init(diagram) {
      const layers = diagram.layers = [];

      [
        "nodes",
        "groups",
        "edges",
        "graphics",
        "simulations",
        "autocompleteItems",
        "focusedGroup",
        "transform",
        "zoomBehavior"
      ].forEach(key => {
        Object.defineProperty(diagram, key, {
          get() {
            return layers[0]?.[key]
          },
          set(val) {
            if (layers[0]) {
              layers[0][key] = val
            }
          },
          configurable: true,
        })
      });
      ["svg", "groupsContainer", "layerContainer"].forEach(key => {
        Object.defineProperty(diagram.dom, key, {
          get() {
            return layers[0]?.dom[key]
          },
          set(val) {
            if (layers[0]) {
              layers[0].dom[key] = val
            }
          },
          configurable: true,
        })
      })
      Object.defineProperty(diagram, "currentLayer", {
        get() {
          return layers[0]
        },
        configurable: true,
      })
    },
    undoInit(diagram) {
      [
        "nodes",
        "groups",
        "edges",
        "graphics",
        "simulations",
        "autocompleteItems",
        "focusedGroup",
        "transform",
        "zoomBehavior"
      ].forEach(key => {
        delete diagram[key]
      });
      ["svg", "groupsContainer", "layerContainer"].forEach(key => {
        delete diagram.dom[key]
      })
      delete diagram.currentLayer
    },
    async refreshLayer(diagram) {
      if (!diagram.layers || diagram.layers.length === 0) return
      await this.remove(diagram.layers[0])
      this.undoInit(diagram)
      document.querySelector(".setting-modal-container").remove()

      const layer = await Layers.push("main", diagram, Data.fetch("api/diagramlayer3.json"))
      layer.processing = false
      Simulations.init(diagram, layer)
      Grouping.init(diagram, layer)
      Layout.restore(diagram, layer)
      Zoom.restore(diagram, layer)
    },
    async toggle(layer, show, duration = 1000) {
      Object.values(layer.dom).forEach(el => {
        el.transition().duration(duration).ease(d3.easeLinear).style("opacity", show ? 1 : 0)
      })
      return new Promise(resolve => setTimeout(resolve, duration))
    },
    async push(id, diagram, data, { delay, fadeDuration } = { delay: 0, fadeDuration: 1000 }) {
      const layer = {
        id,
        diagram,
        dom: {},
        graphics: {},
        autocompleteItems: [],
        focusedGroup: -1,
        settings: diagram.settings,
        processing: true
      },
      first = !(diagram.layers && diagram.layers.length > 0)

      if (first) this.init(diagram)
      diagram.layers.unshift(layer)

      layer.dom.svg = diagram.dom.visContainer.append("svg")
        .style("width", "100%").style("height", "100%")

      if (!first) {
        const visContainer = diagram.dom.visContainer.node()

        layer.dom.svg
          .style("width", visContainer.clientWidth - 60)
          .style("height", visContainer.clientHeight - 60)
          .style("position", "absolute")
          .style("background", "transparent")
          .style("left", 40)
          .style("top", 30)
          .style("z-index", diagram.layers.length + 1)
          .style("opacity", 0)
        Grouping.box(diagram, layer.dom.svg)
          .attr("x", 5)
          .attr("y", 5)
          .style("width", "calc(100% - 10px)")
          .style("height", "calc(100% - 10px)")
          .attr("fill", "#eee")
        layer.dom.closeButton = diagram.dom.visContainer.append("img")
          .attr("src", "assets/img/close.png")
          .attr("class", "clickable")
          .style("height", "30px")
          .style("width", "30px")
          .style("position", "absolute")
          .style("z-index", 999)
          .style("top", "25px")
          .style("cursor", "pointer")
          .style("left", visContainer.clientWidth - 60 + "px")
        layer.dom.closeButton.on("click", function() {
          Layers.remove(layer)
        })
      }
      layer.dom.layerContainer = layer.dom.svg.append("g").attr("class", "container")
      Zoom.init(diagram, layer)

      // then we show the loading spinner in case data fetching takes a while
      UI.loading.start(diagram)

      if (!first) {
        setTimeout(() => {
          this.toggle(layer, true, fadeDuration)
        }, delay)
      }

      const graph = await data
      if (first) {
        GLOBAL_DATA = {
          devices: [...graph.devices],
          edges: [...(Utils.removeDuplicatedLinks(graph.links) ?? [])],
          subnets: [...graph.subnets],
          groups: [
            ...graph.groups?.map((name, i) => ({
              id: i,
              name,
              title_width: Utils.getTextWidth(name),
              parent: name === "Internet" ? 1 : -1,
              hasChildGroup: name === "City Hall",
            })),
          ],
        }
        GLOBAL_DATA.devices.map((device, index) => {
          device.id = index
        })
        GLOBAL_DATA.subnets.map((subnet, index) => {
          subnet.id = index
        })
      }
      // then we wait for and parse the data
      Data.process(layer, graph, first)
      layer.dom.groupsContainer = layer.dom.layerContainer.append("g").attr("class", "groups")
      // then we set the graphics
      Graphics.create(diagram, layer)

      if (!first) {
        Grouping.box(diagram, layer.dom.svg)
          .attr("x", 5)
          .attr("y", 5)
          .style("width", "calc(100% - 10px)")
          .style("height", "calc(100% - 10px)")
          .attr("fill", "none")
      }
      if (first) Pannels.init(diagram)
      UI.loading.finish(diagram)

      return layer
    },
    async push_subnets(source, target, diagram, subnets_data) {
      const layer = {
        id: `subnets-${source}:${target}`,
        diagram,
        dom: {},
        graphics: {},
        autocompleteItems: [],
        focusedGroup: -1,
        settings: diagram.settings,
        processing: true,
      }

      diagram.layers.unshift(layer)
      layer.dom.svg = diagram.dom.visContainer.append("svg")
        .style("width", "100%").style("height", "100%")

      const visContainer = diagram.dom.visContainer.node()

      layer.dom.svg
        .style("width", visContainer.clientWidth - 60)
        .style("height", visContainer.clientHeight - 60)
        .style("position", "absolute")
        .style("background", "transparent")
        .style("left", 40)
        .style("top", 30)
        .style("z-index", diagram.layers.length + 1)
      // .style("opacity", 0)
      Grouping.box(diagram, layer.dom.svg)
        .attr("x", 5)
        .attr("y", 5)
        .style("width", "calc(100% - 10px)")
        .style("height", "calc(100% - 10px)")
        .attr("fill", "#eee")
      layer.dom.closeButton = diagram.dom.visContainer
        .append("img")
        .attr("src", "assets/img/close.png")
        .attr("class", "clickable")
        .style("height", "30px")
        .style("width", "30px")
        .style("position", "absolute")
        .style("z-index", 999)
        .style("top", "25px")
        .style("cursor", "pointer")
        .style("left", visContainer.clientWidth - 60 + "px")
      layer.dom.closeButton.on("click", function () {
        Layers.remove(layer)
      })
      layer.dom.layerContainer = layer.dom.svg.append("g")
      Zoom.init(diagram, layer)

      // then we show the loading spinner in case data fetching takes a while
      UI.loading.start(diagram)

      layer.nodes = subnets_data.nodes
      layer.edges = subnets_data.edges
      layer.groups = []
      // then we set the graphics
      Graphics.create(diagram, layer)
      layer.dom.groupsContainer = layer.dom.layerContainer.append("g").attr("class", "groups")
      Grouping.box(diagram, layer.dom.svg)
        .attr("x", 5)
        .attr("y", 5)
        .style("width", "calc(100% - 10px)")
        .style("height", "calc(100% - 10px)")
        .attr("fill", "none")

      UI.loading.finish(diagram)

      return layer
    },
    async remove(layer) {
      if (layer.processing) return
      layer.processing = true
      layer.diagram.layers.splice(layer.diagram.layers.findIndex(l => layer === l), 1)
      await this.toggle(layer, false, 0)
      Object.values(layer.dom).forEach(el => el.remove())
    },
    drillDown: {
      apiUrl: "api/diagramlayer2.json",
      async device(diagram, node) {
        let dataPromise = Data.fetch(`${this.apiUrl}?device=${node.name}`).then(data => ({
          ...data,
          devices: [_.cloneDeep(node), ...data.links.map(link => ({
            name: link.target
          }))]
        }))

        const targetZoom = Math.max(1.5, diagram.transform.k)
        await Zoom.focusOnNode(diagram, node, targetZoom, 250)

        const layer = await Layers.push(node.name, diagram, dataPromise)

        await dataPromise.then(data => {
          const newNode = Utils.findNode(layer, node.name)
          const radius = Math.max(diagram.dom.svg.node().clientHeight, diagram.dom.svg.node().clientWidth) + 100
          const separation = ((360 / data.links.length) * Math.PI) / 180

          newNode.x = layer.dom.svg.node().clientWidth / 2
          newNode.y = layer.dom.svg.node().clientHeight / 2
          Zoom.focusOnNode(diagram, newNode, targetZoom, 0)

          data.links.forEach((link, i) => {
            link.source = newNode
            link.target.x = newNode.x + (Math.cos(separation * i) * radius)
            link.target.y = newNode.y + (Math.sin(separation * i) * radius)
          })

          Graphics.update(layer)

          Zoom.restrictArea(layer)
          layer.zoomBehavior.scaleExtent([targetZoom, diagram.settings.maxZoomIn])
        })

        return layer
      },
      async subnet(diagram, node) {
        let dataPromise = Data.fetch(`${this.apiUrl}?subnet=${node.subnet}`).then(data => ({
          ...data,
          devices: data.devices.concat(
            data.links.reduce((missing, { source, target }) => {
              if (!data.devices.find(({ name }) => source === name)) {
                missing.push({ name: source, external: true })
              } else if (!data.devices.find(({ name }) => target === name)) {
                missing.push({ name: target, external: true })
              }
              return missing
            }, [])
          )
        }))

        await Zoom.focusOnNode(diagram, node, Math.max(1.5, diagram.transform.k), 250)

        const layer = await Layers.push(node.name, diagram, dataPromise, {
          delay: 0,
          fadeDuration: 500
        })

        Simulations.init(diagram)
        await dataPromise.then(data => {
          const nodes = data.devices.filter(device => !device.external)
          const group = Grouping.fromNodes(diagram, nodes)
          const radius = Math.max(diagram.dom.svg.node().clientHeight, diagram.dom.svg.node().clientWidth) + 100
          const externalDevices = data.devices.filter(n => n.external)
          const separation = Math.min(((360 / externalDevices.length) * Math.PI / 180), 0.5)

          externalDevices.forEach((node, i) => {
            const external = Utils.findNode(layer, node.name)
            const svg = diagram.dom.svg.node()

            external.x = external.fx = group.cx + (Math.cos(separation * i) * radius) + svg.clientWidth
            external.y = external.fy = group.cy + (Math.sin(separation * i) * radius) + svg.clientHeight
          })
          Graphics.update(layer)

          // this waits until the simulation positions the nodes
          return new Promise(resolve => {
            setTimeout(async () => {
              Grouping.polygonGenerator(diagram, group, nodes)
              await Zoom.focusOnArea(diagram, group)

              Zoom.restrictArea(layer)
              layer.zoomBehavior.scaleExtent([layer.transform.k, diagram.settings.maxZoomIn])

              resolve()
            }, 500)
          })
        })

        return layer
      },
      async do(diagram, node) {
        let layer

        if (node.isCloud) {
          layer = await this.subnet(diagram, node)
        } else {
          layer = await this.device(diagram, node)
        }

        layer.processing = false
      }
    }
  }

  const StatusFeed = {
    init (diagram, layer) {
      const feed = diagram.statusFeed = {
        layer,
        interval: null,
        active: true,
        data: [],
      }

      feed.interval = setInterval(() => {
        if (feed.active) {
          const data = feed.layer.nodes
          feed.data = data.map(d => {
            const status = Math.random() > 0.5
            return {
              id: d.id,
              status: status ? "up" : "down",
            }
          })
        }
      }, 1000)
    },
    teardown (diagram) {
      clearInterval(diagram.statusFeed.interval)
    },
    start (diagram) {
      diagram.statusFeed.active = true
    },
    stop (diagram) {
      diagram.statusFeed.active = false
    },
    get (diagram) {
      return diagram.statusFeed.data
    },
  }

  function reset(diagram) {
    if (!confirm("Are you sure you want to clear all saved locations and revert all devices to natural float?")) return
    // clear stored layout and zoom
    Layout.clear(diagram)
    Zoom.clear(diagram)
    location.reload()
  }

  function destroy(diagram, publicInstance) {
    Utils.cleanEventListeners(diagram)
    Simulations.teardown(diagram)
    UI.teardown(diagram)

    Object.keys(publicInstance).forEach(key => delete publicInstance[key])
    Object.keys(diagram).forEach(key => delete diagram[key])
    diagram = null
  }

  function updateSettings(diagram, newSettings) {
    const flags = ["toolbar", "grouping", "floatMode"]
    const { settings } = diagram
    let zoomParametersChanged = false

    Object.keys(newSettings).forEach(key => {
      const value = newSettings[key]

      // if value is a boolean flag and is set to change
      if (flags.includes(key) && value !== settings[key]) {
        // validate that flag value is a boolean
        if (typeof value !== "boolean") throw new Error(`${key} must be a boolean value`)
        // execute the corresponding method
        switch(key) {
          case "toolbar":
            UI.toolbar.toggle(diagram)
            break
          case "grouping":
            Grouping.toggle(diagram)
            break
          case "floatMode":
            toggleFloatMode()
            break
        }
      } else {
        switch(key) {
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
    const diagram = {
      id,
      dom: { container },
      docEventListeners: []
    }
    diagram.settings = Object.assign({
      toolbar: false,
      grouping: Store.get(diagram, "grouping") !== "false",
      floatMode: FLOATMODE.FLOAT,
      groupPadding: 95,
      groupBorderWidth: 10,
      zoomInMult: 1.25,
      zoomOutMult: 0.8,
      maxZoomIn: 8,
      maxZoomOut: 0.1
    }, settings)

    UI.create(diagram, container)
    const layer = await Layers.push("main", diagram, Data.fetch("api/diagramlayer3.json"))
    layer.processing = false
    Simulations.init(diagram, layer)
    Grouping.init(diagram, layer)
    Layout.restore(diagram, layer)
    Zoom.restore(diagram, layer)
    StatusFeed.init(diagram, layer)

    return {
      destroy() { destroy(diagram, this) },
      reset: () => reset(diagram),
      doVisioExport: () => doVisioExport(diagram),
      updateSettings: (newSettings) => updateSettings(diagram, newSettings),
      toggleFloatMode: mode => toggleFloatMode(diagram, mode),
      toggleGrouping: () => Grouping.toggle(diagram),
      toggleToolbar: () => UI.toolbar.toggle(diagram)
    }
  }

  return { create, updateSettings }
})()
