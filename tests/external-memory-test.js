/* global process */
// The index memory (heap nodes or mmap'd file) is reported to V8 as external
// memory, so that the GC weighs indexes that are no longer referenced and
// collects them.
//
// Without it (4.0.1), V8 only sees a small JS wrapper per index: loading a
// fresh index for every request, as bot-api does on each Think, keeps every
// dropped mapping alive until an unrelated GC, and RSS grows with the number
// of loads. process.memoryUsage().external does not include this accounting
// on recent V8 versions, so the test checks the effect: RSS stays bounded.
//
//   node tests/external-memory-test.js
var test = require('tape');
var fs = require('fs');
var os = require('os');
var path = require('path');
var Annoy = require('./load-binding')();

var DIMENSIONS = 200;
var ITEMS = 5000;
var LOADS = 1000;

var file = path.join(os.tmpdir(), 'annoy-external-memory-' + process.pid + '.ann');

function vector(seed) {
  var v = [];
  for (var d = 0; d < DIMENSIONS; d++) v.push(Math.sin(seed * 31 + d));
  return v;
}

test('dropped indexes are collected: RSS stays bounded under load churn', function(t) {
  var index = new Annoy(DIMENSIONS, 'Angular');
  for (var i = 0; i < ITEMS; i++) index.addItem(i, vector(i));
  index.build(10);
  t.ok(index.save(file), 'saved');
  index.unload();
  var fileSize = fs.statSync(file).size;
  var query = vector(-1);

  var rssBefore = process.memoryUsage().rss;
  var peak = 0;
  var n = 0;

  // Load, query and drop one index per turn, yielding to the event loop
  // like a request handler does (ObjectWrap finalizers run after the GC).
  (function next() {
    if (n === LOADS) {
      fs.unlinkSync(file);
      var leakedLoads = peak / fileSize;
      t.ok(
        leakedLoads < LOADS / 4,
        'peak RSS growth ' + Math.round(peak / 1048576) + ' MB is the size of ' +
          leakedLoads.toFixed(0) + ' indexes, out of ' + LOADS + ' loaded'
      );
      t.end();
      return;
    }
    var loaded = new Annoy(DIMENSIONS, 'Angular');
    loaded.load(file);
    loaded.getNNsByVector(query, 5, 2000, true);
    loaded = null;
    n++;
    setImmediate(function() {
      var growth = process.memoryUsage().rss - rssBefore;
      if (growth > peak) peak = growth;
      next();
    });
  })();
});
