'use strict';

import xtend from 'xtend';
import bbox from '@turf/bbox';
import debounce from 'lodash/debounce';

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

  clearMarkers = () => {
    if (this.features) {
      this.features.forEach(feature => {
        if (feature.marker) {
          this.map.getCanvasContainer().removeChild(feature.marker);
          delete feature.marker;
        }
      });
    }
  }

  queryFeatures = () => {
    this._debouncedQueryFeatures.cancel();
    this.clearMarkers();

    this.features = this.map.queryRenderedFeatures({ layers: this.options.layers });

    var keydown = function (e) {
      // this = this control
      console.log(e.target.getAttribute('x'));
      e.preventDefault();
      e.stopPropagation();
    }

    this.features.map((feature) => {
      let { width, height } = this.options;
      const label = feature.properties[this.options.accessibleLabelProperty];

      feature.marker = document.createElement('button');
      feature.marker.setAttribute('aria-label', label);
      feature.marker.setAttribute('title', label);
      feature.marker.setAttribute('tabindex', 0);
      feature.marker.style.display = 'block';

      let position;
      if (feature.geometry.type === 'Point') {
        position = this.map.project(feature.geometry.coordinates);
      } else {
        const featureBbox = bbox(feature);
        const bl = this.map.project([featureBbox[0], featureBbox[1]]);
        const tr = this.map.project([featureBbox[2], featureBbox[3]]);

        width = Math.abs(tr.x - bl.x);
        height = Math.abs(tr.y - bl.y);

        position = {
          x: ((tr.x + bl.x) / 2),
          y: ((tr.y + bl.y) / 2),
        };
      }
      feature.marker.style.width = `${width}px`;
      feature.marker.style.height = `${height}px`;
      feature.marker.style.transform = `translate(-50%, -50%) translate(${position.x}px, ${position.y}px)`;
      feature.marker.className = 'mapboxgl-accessibility-marker';
      feature.marker.setAttribute('x', position.x);
      feature.marker.setAttribute('y', position.y);
      feature.marker.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('stopped propagation and prevented default');
      }, false);

      // get control:
      // map._controls.find(x => x instanceof MapboxAccessibility)

      feature.marker.addEventListener('keydown', keydown.bind(this));


      feature.marker.addEventListener('blur', function (e) {
        console.log('lost focus to:');
        console.log(document.activeElement);
      });

      this.map.getCanvasContainer().appendChild(feature.marker);
      return feature;
    });
  }

  _movestart = () => {
    // this._debouncedQueryFeatures.cancel();
    // this.clearMarkers();
  }

  _moveend = () => {
    if (!this.map.isMoving()) {
      this._debouncedQueryFeatures();
    }
  }

  _render = (e) => {
    if (e.isSourceLoaded && !this.rendered) {
      this.rendered = true;
      this._debouncedQueryFeatures();
    }
  }

  onAdd(map) {
    this.map = map;

    this._debouncedQueryFeatures = debounce(this.queryFeatures, 100);

    this.map.on('movestart', this._movestart);
    this.map.on('moveend', this._moveend);
    this.map.on('sourcedata', this._render);

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
