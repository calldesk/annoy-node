/* global process */

// Builds and queries deterministic random Annoy indexes with one binding and
// writes every result to JSON, so that two bindings (possibly running under
// different Node versions) can be compared value by value.
//
//   node runner.js build <binding.node> <outDir>
//       build, save to <outDir>/<case>.annoy, query, write <outDir>/<case>.build.json
//   node runner.js load <binding.node> <outDir> <indexDir>
//       load <indexDir>/<case>.annoy, query, write <outDir>/<case>.load.json
//
// JSON numbers round-trip doubles exactly, and every float Annoy returns is
// widened to a double, so comparing the parsed JSON is an exact comparison.

var fs = require('fs');
var path = require('path');
var cases = require('./cases');

var mode = process.argv[2];
var bindingPath = process.argv[3];
var outDir = process.argv[4];
var indexDir = process.argv[5];

if ((mode !== 'build' && mode !== 'load') || !bindingPath || !outDir || (mode === 'load' && !indexDir)) {
  console.error('usage: runner.js build <binding> <outDir> | load <binding> <outDir> <indexDir>');
  process.exit(2);
}

var Annoy = require(path.resolve(bindingPath)).Annoy;
fs.mkdirSync(outDir, { recursive: true });

cases.all().forEach(function(c) {
  var index = new Annoy(c.dimensions, c.metric);
  var annoyFile;
  if (mode === 'build') {
    var items = cases.items(c);
    items.forEach(function(v, i) {
      index.addItem(i, v);
    });
    index.build(c.trees);
    annoyFile = path.join(outDir, c.name + '.annoy');
    if (!index.save(annoyFile)) throw new Error('save failed: ' + annoyFile);
  } else {
    annoyFile = path.join(indexDir, c.name + '.annoy');
    if (!index.load(annoyFile)) throw new Error('load failed: ' + annoyFile);
  }

  var result = { case: c.name, nItems: index.getNItems(), byItem: [], byVector: [], distances: [], items: [] };
  cases.queryItems(c).forEach(function(q) {
    result.byItem.push({
      q: q,
      withDistances: index.getNNsByItem(q, c.k, -1, true),
      ids: index.getNNsByItem(q, c.k, -1, false),
      searchK: index.getNNsByItem(q, c.k, c.searchK, true)
    });
  });
  cases.queryVectors(c).forEach(function(v) {
    result.byVector.push({
      withDistances: index.getNNsByVector(v, c.k, -1, true),
      ids: index.getNNsByVector(v, c.k, -1, false),
      searchK: index.getNNsByVector(v, c.k, c.searchK, true)
    });
  });
  cases.distancePairs(c).forEach(function(p) {
    result.distances.push(index.getDistance(p[0], p[1]));
  });
  cases.queryItems(c).forEach(function(q) {
    result.items.push(index.getItem(q));
  });
  index.unload();
  fs.writeFileSync(path.join(outDir, c.name + '.' + mode + '.json'), JSON.stringify(result));
});
