## Mapbox route editor

Super simple proof of concept exercise to build a route editor with walking
path matching using mapbox gl and the mapbox api.

The map loads in line segment editing mode. Double click to place the last line
segment, then wait for the path to be matched and drawn. Moving points around
will then update only the affected paths.

Written in vanilla, es6 javascript with no build syste , so modern browsers only
(I tested with latest Chrome).