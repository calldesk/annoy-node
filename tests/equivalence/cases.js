// Deterministic test cases shared by runner.js and the equivalence test.

var METRICS = ['Angular', 'Euclidean', 'Manhattan'];
var DIMENSIONS = [3, 16, 64, 200];
var N_ITEMS = 3000;

// mulberry32: small seeded PRNG, identical on every Node version.
function prng(seed) {
  var a = seed >>> 0;
  return function() {
    a = (a + 0x6d2b79f5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vectors(seed, count, dimensions) {
  var rand = prng(seed);
  var out = [];
  for (var i = 0; i < count; i++) {
    var v = new Array(dimensions);
    for (var d = 0; d < dimensions; d++) v[d] = rand() * 2 - 1;
    out.push(v);
  }
  return out;
}

function all() {
  var out = [];
  DIMENSIONS.forEach(function(dimensions, di) {
    METRICS.forEach(function(metric, mi) {
      out.push({
        name: metric.toLowerCase() + '-' + dimensions + 'd',
        seed: 1000 + di * 10 + mi,
        metric: metric,
        dimensions: dimensions,
        nItems: N_ITEMS,
        trees: 10,
        k: 25,
        searchK: 500,
        nQueries: 100
      });
    });
  });
  return out;
}

function items(c) {
  return vectors(c.seed, c.nItems, c.dimensions);
}

function queryVectors(c) {
  return vectors(c.seed + 500000, c.nQueries, c.dimensions);
}

function queryItems(c) {
  var rand = prng(c.seed + 900000);
  var out = [];
  for (var i = 0; i < c.nQueries; i++) out.push(Math.floor(rand() * c.nItems));
  return out;
}

function distancePairs(c) {
  var rand = prng(c.seed + 700000);
  var out = [];
  for (var i = 0; i < c.nQueries; i++) {
    out.push([Math.floor(rand() * c.nItems), Math.floor(rand() * c.nItems)]);
  }
  return out;
}

module.exports = { all: all, items: items, queryVectors: queryVectors, queryItems: queryItems, distancePairs: distancePairs };
