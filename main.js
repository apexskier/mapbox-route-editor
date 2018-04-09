// https://stackoverflow.com/a/901144/2178159
function getParameterByName(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, "\\$&");
  const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return "";
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}

// fetched from server
// const initialRoute = await (await fetch(url, optoins)).json()
const initialRoute = {
  coordinates: [
    [-122.19601353206849, 47.5794307285843],
    [-122.18931880833856, 47.57908989406209],
    [-122.18704512858119, 47.581646098895504],
    [-122.18919249279648, 47.58462818012359],
    [-122.1831293467769, 47.59238079631933],
    [-122.18249776906652, 47.600643309630925],
    [-122.18527671099217, 47.60243192936784],
    [-122.18287671569274, 47.60353913950814],
    [-122.17845567172014, 47.60345397033177],
    [-122.1737819966634, 47.607712259418975],
    [-122.15925570932484, 47.60524249396883],
    [-122.15925570932484, 47.60669030165329],
    [-122.15319256330525, 47.60694579296404],
    [-122.15331887884733, 47.61009674988799],
    [-122.14864520379058, 47.61009674988799],
    [-122.14813994162228, 47.60711611981296],
    [-122.13778206717217, 47.605157327565735],
    [-122.13576101849897, 47.59953603820054],
    [-122.13197155223673, 47.59655480632159],
    [-122.13272944548919, 47.589058387131985],
    [-122.1168136871878, 47.58973992415986],
    [-122.11567684730915, 47.59817321042016],
    [-122.12338209537566, 47.59817321042016],
    [-122.12540314404886, 47.59604372094387],
    [-122.1305820812739, 47.596384445083714]
  ],
  type: "LineString"
};

const bounds = initialRoute.coordinates.reduce((bounds, coord) => {
  return bounds.extend(coord);
}, new mapboxgl.LngLatBounds());

const token = getParameterByName("token");
mapboxgl.accessToken = token;
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v9",
  // Can't use bounds as initial position (see https://github.com/mapbox/mapbox-gl-js/issues/1970)
  // so we'll approximate it, then do a fitBounds when loaded
  center: bounds.getCenter(),
  zoom: 12
});

const draw = new MapboxDraw({
  controls: {
    line_string: true
  },
  displayControlsDefault: false,
  defaultMode: "draw_line_string"
});

function pointsEqual([aLat, aLng], [bLat, bLng]) {
  return aLat === bLat && bLng === bLng;
}

map.on("load", async () => {
  map.fitBounds(bounds, { padding: 20 });

  map.addControl(draw);

  const [editId] = draw.add(initialRoute);

  // store the matched paths we get from the service in a mapbox source
  map.addSource("rendered-path-source", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: []
    }
  });

  // display the matched paths from the service
  map.addLayer({
    id: "rendered-path-layer",
    type: "line",
    source: "rendered-path-source"
  });

  // save the last displayed coords so we can tell what changes
  let lastLineCoords = draw.get(editId).geometry.coordinates;

  // keep track of all matched segments between lines
  // stored by the index of the first point. if i+1 or i+2 changes, we need to
  // invalidate the segment
  // we'll be doing some slightly weird stuff by dyanmically deleting and indexing into
  // an array. If you debug, the array will be mostly empty, which can be confusing
  // when this changes, write it to the store (manually right now)
  let lineMatchLegs = new Array(lastLineCoords.length);

  // get and save a match segment from the service
  async function updateSegment(i, coords, precision) {
    const queryCoords = [coords[i], coords[i + 1]]
      .map(coord => coord.join(","))
      .join(";");

    const queryRadiuses = [precision, precision].join(";");

    // TODO: Use something like RX.js to create a stream for this. This would
    // allow me to cancel requests when a new one comes in so I'm always using the
    // latest data if the user updates too fast for the network to keep up
    const req = await fetch(
      `https://api.mapbox.com/matching/v5/mapbox/walking/${queryCoords}?access_token=${token}&geometries=geojson&radiuses=${queryRadiuses}`,
      { method: "GET" }
    );
    const data = await req.json();
    lineMatchLegs[i] = data.matchings;
  }

  // push saved segments to the mapbox source
  function updateRenderedPath() {
    // maybe? improve rendering performance by update/render each segment individually
    map.getSource("rendered-path-source").setData({
      type: "FeatureCollection",
      features: [].concat(
        ...lineMatchLegs.filter(l => l).map(matches =>
          matches.map(match => ({
            type: "Feature",
            properties: {},
            geometry: match.geometry
          }))
        )
      )
    });
  }

  // full reset, used on init and when we don't know what to do
  async function resetSegments(coords) {
    lineMatchLegs = new Array(coords.length);
    await Promise.all(
      coords.slice(0, -1).map((_, i) => updateSegment(i, coords, 30))
    );
    updateRenderedPath();
  }

  await resetSegments(lastLineCoords);

  map.on("draw.update", async ev => {
    const newCoords = ev.features[0].geometry.coordinates;

    // doesn't account for adding or removing points
    // just resets if that hppens for now
    if (lastLineCoords.length === newCoords.length) {
      let mutatedIndexes;
      let radiuses;

      // Diff against the last version of the line and only fetch segments for
      // the point + next and previous coordinates
      const diffIndex = lastLineCoords.findIndex(
        (coord, i) => !pointsEqual(newCoords[i], coord)
      );
      if (diffIndex < 0) {
        // just in case
        return;
      }
      mutatedIndexes = [];
      if (diffIndex > 0) {
        mutatedIndexes.push(diffIndex - 1);
      }
      mutatedIndexes.push(diffIndex);
      if (diffIndex < newCoords.length - 1) {
        mutatedIndexes.push(diffIndex + 1);
      }

      mutatedIndexes.forEach(i => delete lineMatchLegs[i]);

      // decrease precision so we get more results. base on zoom, so you can
      // be more precise when you zoomn in
      const precision = -Math.pow(map.getZoom(), 2) * (1 / 16) + 50; // TODO: play around with this graph

      // iterate over pairs of path segments (so don't use the last point)
      // wait for all the segments to update before proceding
      await Promise.all(
        mutatedIndexes.slice(0, -1).map(async i => {
          await updateSegment(i, newCoords, precision);
        })
      );
    } else {
      resetSegments(newCoords);
    }

    updateRenderedPath();

    lastLineCoords = newCoords;
  });

  map.on("draw.create", ev => {
    console.log(ev);
    console.log("Saving to server", ev.features);
    // await fetch(url, { body: ev.features, method: "PUT" })
    // handle errors
  });

  draw.changeMode("draw_line_string", {
    featureId: editId,
    from: initialRoute.coordinates[initialRoute.coordinates.length - 1]
  });
});
