'use strict';

import xtend from 'xtend';
import centroid from '@turf/centroid';
// import bbox from '@turf/bbox';
import { point, featureCollection, lineString } from '@turf/helpers';
import bboxPolygon from '@turf/bbox-polygon';
import flatten from '@turf/flatten';
import combine from '@turf/combine';
// import dissolve from '@turf/dissolve';
// import intersect from '@turf/intersect';
import lineSplit from '@turf/line-split';
import bboxClip from '@turf/bbox-clip';
import lineIntersect from '@turf/line-intersect';
import booleanWithin from '@turf/boolean-within';
import lineSlice from '@turf/line-slice';

export default class MapboxAccessibility {
  constructor(options) {
    const defaultOptions = {
      width: 0.01,
      height: 0.01,
      // width: 0.002,
      // height: 0.002,
      minWidth: 0.0005,
      minHeight: 0.0005,
      maxWidth: 1,
      maxHeight: 1
    };

    this.options = xtend(defaultOptions, options);
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
    // console.log('updateCursor');
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

  // https://gis.stackexchange.com/questions/290438/turfjs-intersect-line-and-polygon#:~:text=In%20old%20turfjs%20versions%2C%20it,polygon%2C%20like%20in%20this%20example.&text=The%20docs%20say%20that%20the,so%20the%20error%20is%20documented.
  intersectLine = (line, poly) => {
    let intersectionPoints = lineIntersect(line, poly);
    if (intersectionPoints.features.length == 0) return null;
    let intersectionPointsArray = intersectionPoints.features.map(d => d.geometry.coordinates);
    if (intersectionPointsArray.length < 2) {
      // only one point of intersection
      let splitLines = lineSplit(line, poly);
      line = splitLines.features.find(f => booleanWithin(f, poly));
      return line;
    }
    return null;
    // two points of intersection
    let slice = lineSlice(point(intersectionPointsArray[0]), point(intersectionPointsArray[1]), line);
    return (slice);
  }

  intersect = (feature, poly) => {
    if (feature.geometry.type == 'Point') {
      return booleanWithin(feature, poly) ? feature : null;
    } else if (feature.geometry.type == 'LineString') {
      if (booleanWithin(feature, poly)) return feature;
      return this.intersectLine(feature, poly);
    } else if (feature.geometry.type == 'MultiLineString') {
      let lines = flatten(feature);
      let intersectingLines = lines.features.map(line => {
        return this.intersectLine(line, poly);
      }).filter(l => l != null);
      if (intersectingLines.length == 0) return null;
      if (intersectingLines.length == 1) return intersectingLines[0];
      let combined = combine(featureCollection(intersectingLines));
      let combinedFeature = combined.features[0];
      combinedFeature.properties = combinedFeature.properties.collectedProperties[0];
      return combinedFeature;
    } else if (feature.geometry.type == 'Polygon') {
      // console.log('CANNOT INTERSECT: ' + feature.geometry.type);
      // just call the turf function:
      // console.log(feature);
      // return intersect(feature, poly);
      return null;
    } else {
      // console.log('CANNOT INTERSECT: ' + feature.geometry.type);
      return null;
    }
  }

  // https://gist.github.com/robmathers/1830ce09695f759bf2c4df15c29dd22d
  groupBy = (data, property = 'id') => {
    // `data` is an array of objects, `key` is the key (or property accessor) to group by
    // reduce runs this anonymous function on each element of `data` (the `item` parameter,
    // returning the `storage` parameter at the end
    return data.reduce(function (storage, item) {
      // get the first instance of the property by which we're grouping
      var group = item.properties[property];

      // set `storage` for this instance of group to the outer scope (if not empty) or initialize it
      storage[group] = storage[group] || [];

      // add this item to its group within `storage`
      storage[group].push(item);

      // return the updated storage to the reduce function, which will then loop through the next
      return storage;
    }, {}); // {} is the initial value of the storage
  };

  unique = (value, index, self) => {
    return index === self.indexOf(value);
  }

  announceFeatures = () => {
    let pix_x = this.cursor.offsetLeft;
    let pix_y = this.cursor.offsetTop;
    let pix_width = this.cursor.offsetWidth;
    let pix_height = this.cursor.offsetHeight;

    // let features = this.map.queryRenderedFeatures([[pix_x, pix_y + pix_height], [pix_x + pix_width, pix_y]], {});
    let features = this.map.queryRenderedFeatures();

    features.forEach(f => {
      // if (f.properties.other_tags == '"amenity"=>"bicycle_rental"') {
      //   console.log('"amenity"=>"bicycle_rental"!!!!!!');
      //   console.log(f.properties.osm_id);
      //   console.log(f);
      // }

      f.properties.id = String(f.id);

      if (f.properties.osm_id !== undefined)
        f.properties.id = f.properties.osm_id;

      f.properties.layer_id = String(f.layer.id);
      f.properties.source_id = String(f.source);
      if (f.source_layer !== undefined)
        f.properties.source_layer = String(f.source_layer);
      if (f._vectorTileFeature !== undefined) {
        var vector_tags = {};
        for (var i = 0; i < f._vectorTileFeature._keys.length; i++) {
          vector_tags[f._vectorTileFeature._keys[i]] = f._vectorTileFeature._values[i];
        }
        f.properties.vector_tags = vector_tags;
      }
    });
    // console.log(features);

    let quads = [0, 1, 2, 3].map(x => {
      let width = (this.options.width / 2.0);
      let height = (this.options.height / 2.0);
      let lon_offset = (x % 2) * width;
      let lat_offset = Math.floor(x / 2) * height;
      let origin = [this.sw[0] + lon_offset, this.sw[1] + lat_offset];
      let extent = [origin[0], origin[1], origin[0] + width, origin[1] + height];
      return extent;
      // return ;
    });
    let quadPolygons = quads.map(q => bboxPolygon(q));
    // // console.log('quads!');
    // // console.log(quads);

    // // console.log(features.filter(f => f.layer.id == 'poi'));

    let quadrantFeatures = [];
    for (var i = 0; i < 4; i++) {
      // console.log(i);
      // console.log(features.map(f => f.layer.id).filter(this.unique));
      // filter road/bridge:
      // let intersecting = features.filter(f => f.layer.id.match(/road|bridge/is)).map(f => {
      let intersecting = features.map(f => {
        if (f.geometry.type == 'Point') {
          // console.log(f);
          return (booleanWithin(f, quadPolygons[i]) ? f : null);
        }
        else if (f.geometry.type.match(/Line|Polygon/is))
          return bboxClip(f, quads[i]);
        else {
          console.log('NOT SUPPORTED!');
          console.log(f.geometry.type);
          return null;
        }
        // return this.intersect(f, quads[i]);
      }).filter(x => x != null);

      // if (i == 0) {
      //   map.getSource('custom').setData(featureCollection(intersecting));
      //   // console.log(intersecting.map(f => f.geometry.type));
      // }

      let flatFeatures = intersecting.flat();
      // group by id:
      let grouped = this.groupBy(flatFeatures, 'id');
      let combined = Object.keys(grouped).map(id => {
        if (grouped[id].length == 0) return null;

        if (grouped[id].length == 1) return grouped[id][0];

        let combinedCollection = combine(featureCollection(grouped[id]));

        if (combinedCollection.features.length == 0) {
          // console.log('combinedCollection EMPTY!');
          // console.log(grouped[id]);
          return null;
        }

        let empty = 0 == combinedCollection.features[0].geometry.coordinates.map(c => c.length).reduce((total, current) => total + current);
        if (empty) return null;

        var combinedFeature = combinedCollection.features[0];
        if (combinedFeature.properties.collectedProperties !== undefined) {
          // console.log('collectedProperties!');
          // console.log(combinedFeature);
          combinedFeature.properties = combinedFeature.properties.collectedProperties[0];
        }
        return combinedFeature;
      }).filter(f => f != null);
      quadrantFeatures[i] = combined;
    }

    // HIGHLIGHT quadrantFeatures!
    // map.getSource('custom').setData(featureCollection(quadrantFeatures.flat()));

    // console.log('quadrantFeatures:');
    // console.log(quadrantFeatures.map(q => q.filter(f => f.geometry.type == 'MultiPolygon')))
    // console.log('done');
    // console.log(quadrantFeatures.map(q => q.map(f => f.properties.layer_id)).flat().filter(this.unique));
    // console.log(quadrantFeatures.map(q => q.filter(f => ['road-primary', 'bridge-primary'].includes(f.properties.layer_id))));

    var quadDescriptions = [0, 1, 2, 3].map(quad => {
      let qFeatures = quadrantFeatures[quad];
      // console.log('QUAD: ' + quad.toString());
      // console.log(qFeatures);
      var names = [];
      var humanNames = [];
      var descriptions = [];
      qFeatures.forEach(feature => {
        var name = (feature.properties.name !== undefined ? feature.properties.name : '');
        names.push(name.trim());
        var humanName = name;
        var description = '';

        if (feature.properties.layer_id.startsWith('water')) {
          if (humanName == '') humanName = 'water';
        }

        if (feature.properties.layer_id.match(/road|bridge|crossing/is)) {
          humanName = name.replace(/^W /is, 'West ')
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
          // console.log(feature);
        }
        humanNames.push(humanName.trim());

        // if (feature.properties.osm_id == '5658662132') {
        //   console.log('********** FOUND BICYCLE RENTAL *********');
        //   console.log(feature);
        // }

        if (feature.properties.layer_id.startsWith('poi') && feature.properties.other_tags !== undefined) {
          let other_tags = feature.properties.other_tags;

          if (typeof other_tags === 'string')
            other_tags = JSON.parse('{' + other_tags.replaceAll('=>', ':') + '}');

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
          if (other_tags['type'] !== undefined) {
            description += ' ' + other_tags['type'];
          }
          if (other_tags['class'] !== undefined) {
            description += ' ' + other_tags['class'];
          }
        }

        // console.log(description);
        descriptions.push(description.trim());
      });

      // console.log('names');
      // console.log(names);
      // console.log('humanNames');
      // console.log(humanNames);
      // console.log('descriptions');
      // console.log(descriptions);

      var featureCount = 0;
      var quadName = ['southwest', 'southeast', 'northwest', 'northeast'][quad] + ' quadrant: ';
      var desc = '';
      var thisDesc = '';

      for (var i = 0; i < humanNames.length; i++) {
        thisDesc = '';

        let humanName = humanNames[i];
        let description = descriptions[i];

        if (humanName != '' && i == humanNames.indexOf(humanName))
          thisDesc += humanNames[i];

        if (description != '')
          thisDesc += ' ' + descriptions[i].replaceAll('_', ' ');

        if (thisDesc != '') {
          desc += thisDesc + ' ... ';
          featureCount++;
        }
      }

      if (featureCount == 0) return '';

      // return quadName + ' (' + featureCount.toString() + ') ' + desc;
      return quadName + ' ' + desc;
    });

    // console.log(quadDescriptions);

    this.label = quadDescriptions.join(' ; ... ... ');
    // console.log(this.label);

    if (this.cursor.getAttribute('aria-label') == this.label) {
      this.label += ' . ';
    }
    this.cursor.setAttribute('aria-label', this.label);
    this.cursor.setAttribute('title', this.label);
    // console.log(this.label);
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
        return;
    }

    var dirLabel = multiplierName + ' ' + dir;
    if (this.announceCommand.getAttribute('aria-label') == dirLabel)
      dirLabel += ' .';
    if (dirLabel.length > 50)
      dirLabel = dirLabel.replaceAll(' .', '');

    // console.log(dirLabel);

    this.announceCommand.setAttribute('aria-label', dirLabel);
    this.map.panTo(this.center);
  };


  createCursor = () => {
    this.cursor = document.createElement('button');
    this.cursor.setAttribute('tabindex', 0);
    this.cursor.setAttribute('aria-label', '');
    this.cursor.setAttribute('aria-live', 'assertive');
    this.cursor.style.display = 'block';
    this.cursor.className = 'mapboxgl-accessibility-cursor';

    this.cursor.addEventListener('keydown', this.keydown);

    this.map.getCanvasContainer().appendChild(this.cursor);

    this.announceCommand = document.createElement('div');
    this.announceCommand.setAttribute('aria-live', 'assertive');
    this.map.getCanvasContainer().appendChild(this.announceCommand);

    setInterval(() => {
      this.cursor.focus();
    }, 1000);

    this.map.addSource('custom', {
      "type": "geojson",
      "data": {
        "type": "FeatureCollection",
        "features": []
      }
    });

    this.map.addLayer({
      id: 'custom-points',
      type: 'circle',
      source: 'custom',
      paint: {
        'circle-radius': 3,
        'circle-color': '#0000ff'
      }
    });

    this.map.addLayer({
      id: 'custom-lines',
      type: 'line',
      source: 'custom',
      paint: {
        'line-width': 1,
        'line-color': '#0000ff'
      }
    });

  }

  _moveend = () => {
    // console.log('_moveend');
    this.setCenter();
    this.updateCursor();

    setTimeout(() => {
      this.announceFeatures();
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
