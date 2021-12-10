'use strict';

import xtend from 'xtend';
import centroid from '@turf/centroid';

export default class MapboxAccessibility {
  constructor(options) {
    const defaultOptions = {
      width: 0.002,
      height: 0.002,
      minWidth: 0.0005,
      minHeight: 0.0005,
      maxWidth: 1,
      maxHeight: 1
    };

    // if (!options && !options.layers) {
    //   throw new Error('An array of layers is required');
    // }

    // if (!options && !options.accessibleLabelProperty) {
    //   throw new Error('a valid accessibleLabelProperty is required');
    // }

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

  setCenter = () => {
    let center = this.map.getCenter().toArray().map(x => Math.round(x * 10000) / 10000);
    let zoom = Math.round(10000 * this.map.getZoom()) / 10000;
    if (this.zoom && this.zoom == zoom && this.center && (center[0] == this.center[0] && center[1] == this.center[1])) {
      return;
    }
    this.center = center;
    this.zoom = zoom;
  }

  updateCursor = () => {
    console.log('updateCursor');
    this.nw = [this.center[0] - (this.options.width / 2.0), this.center[1] + (this.options.height / 2.0)];
    this.sw = [this.center[0] - (this.options.width / 2.0), this.center[1] - (this.options.height / 2.0)];
    this.ne = [this.center[0] + (this.options.width / 2.0), this.center[1] + (this.options.height / 2.0)];
    this.se = [this.center[0] + (this.options.width / 2.0), this.center[1] - (this.options.height / 2.0)];
    this.fit_sw = this.sw.map(x => x - this.options.width / 10);
    this.fit_ne = this.ne.map(x => x + this.options.width / 10);
    var bl = this.map.project(this.sw);
    var tl = this.map.project(this.nw);
    var tr = this.map.project(this.ne);

    var pix_width = Math.abs(tr.x - bl.x);
    var pix_height = Math.abs(tr.y - bl.y);

    this.cursor.style.position = 'absolute';
    this.cursor.style.width = `${pix_width}px`;
    this.cursor.style.height = `${pix_height}px`;
    this.cursor.style.top = `${tl.y}px`;
    this.cursor.style.left = `${tl.x}px`;
  }

  queryTomTom = () => {
    let url = 'https://api.tomtom.com/search/2/categorySearch/.json?key=TOMTOM_API_KEY&categorySet=7315,9361,7332&limit=100&topLeft=' + this.nw[1] + ',' + this.nw[0] + '&btmRight=' + this.se[1] + ',' + this.se[0];
    console.log(url);
    return;

    fetch(url)
      .then(response => response.json())
      .then(data => {
        /*
        Restaurant                  7315
        Shop                        9361
        Market                      7332
        Park and Recreation Area    9362
        Public Transportation Stop  9942
        */
        let restaurants = data.results.filter(r => {
          return r.poi.categories.includes('restaurant');
        }).length;
        let shops = data.results.filter(r => {
          return r.poi.categories.includes('shop');
        }).length;
        let markets = data.results.filter(r => {
          return r.poi.categories.includes('market');
        }).length;
        console.log(data);

        this.label = `Found ${restaurants} restaurants, ${shops} shops, and ${markets} markets.`;
        if (this.cursor.getAttribute('aria-label') == this.label) {
          this.label += ' . ';
        }
        this.cursor.setAttribute('aria-label', this.label);
        this.cursor.setAttribute('title', this.label);
        console.log(this.label);
      });
  }

  announceFeatures = () => {
    let pix_x = this.cursor.offsetLeft;
    let pix_y = this.cursor.offsetTop;
    let pix_width = this.cursor.offsetWidth;
    let pix_height = this.cursor.offsetHeight;

    let features = this.map.queryRenderedFeatures([[pix_x, pix_y + pix_height], [pix_x + pix_width, pix_y]], {});

    // console.log(features.filter(f => f.layer.id == 'poi'));

    let dupFeatures = [...features];
    dupFeatures.forEach(f => f.centroid = centroid(f).geometry.coordinates);
    dupFeatures.forEach(f => {
      let c = f.centroid;
      f.quad = (
        (c[1] < this.center[1] ? 0 : 2) + (c[0] < this.center[0] ? 0 : 1)
      );
      f.quadrant = ['SW', 'SE', 'NW', 'NE'][f.quad];
    });

    let sortedFeatures = dupFeatures.sort((a, b) => a.quad - b.quad);
    var quadFeatures = [0, 1, 2, 3].map(x => {
      return {
        'POI': [],
        'roads': [],
        'buildings': []
      };
    });

    for (var quad = 0; quad < 4; quad++) {
      sortedFeatures.filter(x => x.quad == quad).forEach((feature) => {
        var name = (feature.properties.name === undefined) ? '' : feature.properties.name;
        var description = '';
        // console.log(feature);
        switch (feature.layer.id) {
          case 'poi':
            console.log('poi:');
            console.log(feature);
            // check if exists already:
            let other_tags = JSON.parse('{' + feature.properties.other_tags.replaceAll('=>', ':') + '}')
            console.log('other_tags:');
            console.log(other_tags);

            // light_rail: "yes"
            // network: "RTD"
            // operator: "Regional Transportation District"
            // public_transport: "stop_position"
            // railway: "stop"

            var description = '';
            if (other_tags['public_transport'] !== undefined) {
              description += ' (' + other_tags['network'] + ') ' +
                (other_tags['light_rail'] == 'yes' ? 'light rail station' : ' ') +
                (other_tags['bus'] == 'yes' ? 'bus stop' : ' ')
            }
            if (other_tags['leisure'] !== undefined) {
              description += ' leisure: ' + other_tags['leisure'];
            }
            if (other_tags['amenity'] !== undefined) {
              description += ' ' + other_tags['amenity'];
            }
            if (other_tags['shop'] !== undefined) {
              description += ' ' + other_tags['shop'] + ' shop';
            }
            if (other_tags['craft'] !== undefined) {
              description += ' ' + other_tags['craft'];
            }
            description = name + ' ' + description;

            if (quadFeatures[feature.quad]['POI'].indexOf(description) == -1) {
              quadFeatures[feature.quad]['POI'].push(description);
            }

            break;
          // case 'building':
          //   quadFeatures[feature.quad]['buildings'].push({
          //     type: feature._vectorTileFeatures._values[4],

          //   });
          case 'road-primary':
          case 'road-motorway-trunk':
          case 'road-secondary-tertiary':
          case 'road-street':
          case 'road-rail':
          // case 'transit-label':
          // pedestrian:
          case 'road-path':
          case 'road-pedestrian':
            // if (feature.layer.id == 'transit-label') {
            //   // console.log(feature);
            //   /*
            //   properties:
            //     filterrank: 1
            //     iso_3166_1: "US"
            //     iso_3166_2: "US-CO"
            //     maki: "rail"
            //     mode: "rail"
            //     name: "Littleton Downtown"
            //     name_en: "Littleton/Downtown"
            //     name_script: "Latin"
            //     network: "rail"
            //     stop_type: "station"
            //    */
            //   name += ' ' + feature.network + ' ' +
            //     (feature.light_rail == 'yes' ? 'light rail station' : 'bus stop');
            // }
            name = name.replace(/^W /is, 'West ')
              .replace(/^E /is, 'East ')
              .replace(/^N /is, 'North ')
              .replace(/^S /is, 'South ')
              .replace(/^SW /is, 'Southwest ')
              .replace(/^SE /is, 'Southeast ')
              .replace(/^NW /is, 'Northwest ')
              .replace(/^NW /is, 'Northeast ')
              .replace(/\bAve\b/is, 'Avenue ')
              .replace(/\bSt\b/is, 'Street ')
              .replace(/\bRd\b/is, 'Road ')
              .replace(/\bPl\b/is, 'Place ')
              .replace(/\bCt\b/is, 'Court ')
              .replace(/\bCir\b/is, 'Circle ')
              .replace(/\bDr\b/is, 'Drive ')
              .replace(/\bPkwy\b/is, 'Parkway ')
              .replace(/\bHwy\b/is, 'Highway ')
            if (name && quadFeatures[feature.quad]['roads'].indexOf(name) == -1) {
              quadFeatures[feature.quad]['roads'].push(name);
            }
            break;
          default:
            break;
        }
      });
    };

    this.label = '';

    [0, 1, 2, 3].forEach(quad => {
      if (quadFeatures[quad]['POI'].length + quadFeatures[quad]['roads'].length > 0) {
        if (this.label.length > 0) this.label += '; ... ... ';
        this.label += ['southwest', 'southeast', 'northwest', 'northeast'][quad] + ' quadrant: ';
        if (quadFeatures[quad]['POI'].length > 0) {
          this.label += quadFeatures[quad]['POI'].join(', ');
          this.label += '; ... ';
        }
        if (quadFeatures[quad]['roads'].length > 0) {
          this.label += quadFeatures[quad]['roads'].join(', ');
          this.label += '; ... ';
        }
      }
    });

    if (this.cursor.getAttribute('aria-label') == this.label) {
      this.label += ' . ';
    }
    this.cursor.setAttribute('aria-label', this.label);
    this.cursor.setAttribute('title', this.label);
    console.log(this.label);
  }

  zoomIn = () => {
    this.options.width /= 2;
    this.options.height /= 2;
    if (this.options.width < this.options.minWidth)
      this.options.width = this.options.minWidth;
    if (this.options.height < this.options.minHeight)
      this.options.height = this.options.minHeight;

    this.updateCursor();
    setTimeout(() => {
      this.map.fitBounds([this.fit_sw, this.fit_ne]);
    }, 100);
  }

  zoomOut = () => {
    this.options.width *= 2;
    this.options.height *= 2;
    if (this.options.width > this.options.maxWidth)
      this.options.width = this.options.maxWidth;
    if (this.options.height > this.options.maxHeight)
      this.options.height = this.options.maxHeight;

    this.updateCursor();
    setTimeout(() => {
      this.map.fitBounds([this.fit_sw, this.fit_ne]);
    }, 100);
  }

  getZoomLevel = (multiplier = 1) => {
    let meters = multiplier * this.options.width * 100000;
    if (meters < 1000) {
      return meters.toString() + ' meters';
    } else {
      return (meters / 1000).toString() + ' kilometers';
    }
  }

  keydown = (e) => {
    var dir = '';
    let multiplier = (e.ctrlKey ? 0.2 : (e.shiftKey ? 10 : 1));
    let multiplierName = (e.ctrlKey ? 'nudge' : (e.shiftKey ? 'jump' : ''));
    switch (e.key.toLowerCase()) {
      case '=':
      case '+':
        e.stopPropagation();
        this.zoomIn();
        dir = 'zoom in to ' + this.getZoomLevel();
        break;
      case '-':
        e.stopPropagation();
        this.zoomOut();
        dir = 'zoom out to ' + this.getZoomLevel();
        break;
      case 'm':
        this.center[1] -= multiplier * this.options.height;
        dir = ' south' + this.getZoomLevel(multiplier);
        break;
      case 'i':
        this.center[1] += multiplier * this.options.height;
        dir = 'north ' + this.getZoomLevel(multiplier);
        break;
      case 'j':
        this.center[0] -= multiplier * this.options.width;
        dir = 'west ' + this.getZoomLevel(multiplier);
        break;
      case 'l':
        this.center[0] += multiplier * this.options.width;
        dir = 'east ' + this.getZoomLevel(multiplier);
        break;
      default:
        break;
    }

    var dirLabel = multiplierName + ' ' + dir;
    if (this.announceCommand.getAttribute('aria-label') == dirLabel)
      dirLabel += ' .';
    if (dirLabel.length > 50)
      dirLabel = dirLabel.replaceAll(' .', '');

    console.log(dirLabel);

    this.announceCommand.setAttribute('aria-label', dirLabel);
    this.map.panTo(this.center);
  };


  createCursor = () => {
    this.cursor = document.createElement('button');
    this.cursor.setAttribute('tabindex', 0);
    this.cursor.setAttribute('aria-label', '');
    this.cursor.setAttribute('aria-live', 'polite');
    this.cursor.style.display = 'block';
    this.cursor.className = 'mapboxgl-accessibility-marker';

    this.cursor.addEventListener('keydown', this.keydown);

    this.map.getCanvasContainer().appendChild(this.cursor);

    this.announceCommand = document.createElement('div');
    this.announceCommand.setAttribute('aria-live', 'assertive');
    this.map.getCanvasContainer().appendChild(this.announceCommand);

    setInterval(() => {
      this.cursor.focus();
    }, 1000);
  }

  _moveend = () => {
    console.log('_moveend');
    this.setCenter();
    this.updateCursor();

    setTimeout(() => {
      this.announceFeatures();
      // this.queryTomTom();
    }, 200);
  }

  _render = (e) => {
    this.updateCursor();
  }

  onAdd(map) {
    this.map = map;

    // this._debouncedUpdateCursor = debounce(this.updateCursor, 100);

    this.map.on('moveend', this._moveend);
    this.map.on('render', this._render);

    this.createCursor();

    this._moveend();

    this.announceCommand.setAttribute('aria-label', this.getZoomLevel());

    this.container = document.createElement('div');
    return this.container;
  }

  onRemove() {
    this.container.parentNode.removeChild(this.container);
    this.map.off('moveend', this._moveend);
    this.map.off('render', this._render);
    delete this.map;
  }
}
