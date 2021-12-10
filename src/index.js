'use strict';

import 'regenerator-runtime/runtime';
import xtend from 'xtend';
// import bbox from '@turf/bbox';
// import booleanIntersects from '@turf/boolean-intersects';
// import buffer from '@turf/buffer';
import debounce from 'lodash/debounce';
import flatten from '@turf/flatten';
import joinAlike from 'geojson-linestring-join-alike';
// import booleanPointOnLine from '@turf/boolean-point-on-line';
// import lineIntersect from '@turf/line-intersect';
// import lineSplit from '@turf/line-split';
// import intersect from '@turf/intersect';
// import combine from '@turf/combine';
// import simplify from '@turf/simplify';
// import union from '@turf/union';
// import lineToPolygon from '@turf/turf/line-to-polygon';
import { featureCollection } from '@turf/helpers';

import * as d3 from 'd3';

function pairwise(arr, func) {
  for (var i = 0; i < arr.length - 1; i++) {
    func(arr[i], arr[i + 1])
  }
}





export default class MapboxAccessibility {
  constructor(options) {
    const defaultOptions = {
      width: 24,
      height: 24
    };

    if (!options && !options.layers) {
      throw new Error('An array of layers is required');
    }

    if (!options && !options.accessibleLabelProperty) {
      throw new Error('a valid accessibleLabelProperty is required');
    }

    this.options = xtend(defaultOptions, options);
  }

  clearMarkers = async () => {
    if (this.features) {
      this.features.forEach(feature => {
        if (feature.marker) {
          this.map.getCanvasContainer().removeChild(feature.marker);
          delete feature.marker;
        }
      });
    }
    this.svg.select('#nodes').selectAll("*").remove()
    this.svg.select('#links').selectAll("*").remove()
  }

  queryFeatures = async () => {
    this._debouncedQueryFeatures.cancel();

    const zoom = this.map.getZoom()
    const source = zoom < 11 ? 'highways' : 'composite'
    const sourceLayer = zoom < 11 ? 'highways' : 'road'

    // Workaround mapbox-gl bug: queryRenderedFeatures leaves a huge hole in the middle of the map!
    const sourceFeatures = this.map.querySourceFeatures(source, { sourceLayer })
    // Workaround mapbox-gl bug: when map._fullyLoaded == true or map.loaded() == true,
    // feature properties are not always loaded;
    // queryRenderedFeatures/querySourceFeatures does not return a Promise.
    // Besides, if no features have a name or iso_3166_2, labeling is not possible.
    const numberOfLabelableFeatures = sourceFeatures.filter(f => f.properties.name || f.properties.iso_3166_2 || f.properties[this.options.accessibleLabelProperty]).length

    // Keep executing querySourceFeatures until # of features with properties is stable.
    if (numberOfLabelableFeatures == this._lastNumberOfLabelableFeatures) {
      this._numberOfStableQueries++
    } else {
      this._lastNumberOfLabelableFeatures = numberOfLabelableFeatures
      this._numberOfStableQueries = 1
    }

    if (this._numberOfStableQueries < 3) {
      this._debouncedQueryFeatures()
      return
    }

    this.map.off('render', this._render)

    var roadTypes = [
      'motorway',
      'motorway_link',
      'trunk',
      'trunk_link',
      'primary',
      'primary_link',
    ]
    if (zoom >= 11)
      roadTypes += [
      ]
    if (zoom >= 12.5)
      roadTypes += [
        'secondary',
      ]
    if (zoom >= 13.5)
      roadTypes += [
        'tertiary',
        'primary_link',
        'turning_circle',
      ]
    if (zoom >= 15)
      roadTypes += [
        'residential', 'living_street', 'pedestrian',
        'secondary_link',
        'tertiary_link',
        'sidewalk',
        'footway',
        'cycleway',
        'path',
        'service',
        'service:alley',
        'service:driveway',
        'service:parking_aisle',
        'traffic_signals',
        'crossing',
        'steps',
      ]

    // road names on lines start at zoom level 11
    const roadFeatures = sourceFeatures
      .filter(f => roadTypes.includes(f.properties.class || f.properties.highway))
      .filter(f => ['LineString', 'MultiLineString']
        .includes(f.geometry.type))
      .map(road => {
        if (!road.properties.name) {
          if (road.properties.iso_3166_2)
            road.properties.name = `${road.properties.iso_3166_2} ${road.properties.ref}`
          else if (road.properties.ref)
            road.properties.name = road.properties.ref
        }
        const { _geometry, _vectorTileFeature, ...remaining } = road
        return Object.assign({}, remaining, { geometry: { ..._geometry } })
      })

    // https://www.danieltrone.com/post/clean-geojson-network-javascript/#join-consecutive-alike-lines
    // https://github.com/royhobbstn/geojson-linestring-join-alike/tree/1df0565b7b4669917835e421b406ba0ca6226752

    const roadSegments = featureCollection(roadFeatures)
    const joinFilters = [{ field: 'name', compare: 'must-equal' }]
    const joined = joinAlike(roadSegments, joinFilters)

    joined.features.forEach((road, index) => {
      const label = road.properties.name

      const color = '#' + Math.floor(Math.random() * 16777215).toString(16)
      this.svg
        .select('#links')
        .append('g')
        .attr('id', `road-${index}`)
        .attr("focusable", "true")
        .attr("tabindex", "0")
        .attr('role', 'img')
        .attr("aria-label", label)

      pairwise(road.geometry.coordinates, (current, next) => {

        // feature.marker = document.createElement('button');
        // feature.marker.setAttribute('aria-label', label);
        // feature.marker.setAttribute('title', label);
        // feature.marker.setAttribute('tabindex', 0);
        // feature.marker.style.display = 'block';

        // let position;
        // if (feature.geometry.type === 'Point') {
        //   position = this.map.project(feature.geometry.coordinates);
        // } else {

        const projectedLine = [current, next].map(coords => {
          const projection = this.map.project(coords)
          return [projection.x, projection.y]
        })

        var lineWidth
        switch (road.properties.class) {
          case 'motorway':
          case 'motorway_link':
          case 'trunk':
          case 'trunk_link':
          case 'primary':
          case 'primary_link':
            // color = 'blue'
            // color = '#' + Math.floor(Math.random() * 16777215).toString(16)
            lineWidth = 8
            break
          case 'secondary':
          case 'secondary_link':
          case 'tertiary':
          case 'tertiary_link':
            // color = 'green'
            lineWidth = 4
            break
          case 'footway':
          case 'pedestrian':
          case 'sidewalk':
          case 'cycleway':
          case 'path':
            // color = 'magenta'
            lineWidth = 2
            break
          default:
            // color = 'gray'
            lineWidth = 8
            break
        }

        this.svg
          .select(`#road-${index}`)
          .append('path')
          .style("fill", "none")
          .style("stroke", color)
          .style("stroke-width", lineWidth)
          .style("stroke-linecap", "butt")
          .attr("d", d3.line()(projectedLine))



        // const featureBbox = bbox(feature);
        // const bl = this.map.project([featureBbox[0], featureBbox[1]]);
        // const tr = this.map.project([featureBbox[2], featureBbox[3]]);

        // width = Math.abs(tr.x - bl.x);
        // height = Math.abs(tr.y - bl.y);

        // position = {
        //   x: ((tr.x + bl.x) / 2),
        //   y: ((tr.y + bl.y) / 2),
        // };
        // }
        // feature.marker.style.width = `${width}px`;
        // feature.marker.style.height = `${height}px`;
        // feature.marker.style.transform = `translate(-50%, -50%) translate(${position.x}px, ${position.y}px)`;
        // feature.marker.className = 'mapboxgl-accessibility-marker';

        // this.map.getCanvasContainer().appendChild(feature.marker);
      })
    })
  }

  _movestart = () => {
    this._debouncedQueryFeatures.cancel();
    this.clearMarkers();
    this.map.on('render', this._render)
  }

  _render = () => {
    if (!this.map.loaded() || this.map.isMoving()) { return }
    this._debouncedQueryFeatures()
  }

  onAdd(map) {
    this.map = map;

    this._debouncedQueryFeatures = debounce(this.queryFeatures, 100)
    this._lastNumberOfLabelableFeatures = 0
    this._numberOfStableQueries = 0

    this.map.on('movestart', this._movestart);
    this.map.on('render', this._render);

    this.canvas = this.map.getCanvasContainer()
    this.svg = d3
      .select(this.canvas)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("position", "absolute")
      .style("z-index", 100000)

    this.svg.append("g").attr("id", "links")
    this.svg.append("g").attr("id", "nodes")

    this.container = document.createElement('div');
    return this.container;
  }

  onRemove() {
    this.container.parentNode.removeChild(this.container);
    this.map.off('movestart', this._movestart);
    this.map.off('moveend', this._render);
    this.map.off('render', this._render);
    this._debouncedQueryFeatures.cancel();
    delete this.map;
  }
}
