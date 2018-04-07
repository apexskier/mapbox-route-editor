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

const bounds = initialRoute.coordinates.reduce(function(bounds, coord) {
  return bounds.extend(coord);
}, new mapboxgl.LngLatBounds());

mapboxgl.accessToken = getParameterByName("token");
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

map.on("load", async function() {
  map.fitBounds(bounds, {
    padding: 20
  });

  map.addControl(draw);

  const [editId] = draw.add(initialRoute);
  draw.changeMode("draw_line_string", {
    featureId: editId,
    from: initialRoute.coordinates[initialRoute.coordinates.length - 1]
  });

  map.on("draw.create", function(ev) {
    console.log(ev);
    console.log("Saving to server", ev.features);
  });
});
