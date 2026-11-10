/* global __dirname process global */

// Native memory is released when Annoy objects are collected, and when a
// worker thread that owns indexes exits. Run with --expose-gc.
//
// Each round allocates far more native memory than the allowed RSS growth,
// so a missing finalizer / destructor fails the test.

var test = require('tape');
var fs = require('fs');
var os = require('os');
var path = require('path');
var Worker = require('worker_threads').Worker;
var Annoy = require('./load-binding')();

if (typeof global.gc !== 'function') {
  console.error('run with node --expose-gc');
  process.exit(2);
}

var DIMS = 64;
var ITEMS = 4000;

function fill(index) {
  var v = new Array(DIMS);
  for (var i = 0; i < ITEMS; i++) {
    for (var d = 0; d < DIMS; d++) v[d] = Math.sin(i * 31 + d);
    index.addItem(i, v);
  }
}

function tick() {
  return new Promise(function(resolve) {
    setImmediate(resolve);
  });
}

// N-API finalizers may be deferred to the next event-loop turn after a GC.
async function settle() {
  for (var i = 0; i < 5; i++) {
    global.gc();
    await tick();
  }
}

function rssMB() {
  return process.memoryUsage().rss / (1024 * 1024);
}

function mappedCount(file) {
  if (process.platform !== 'linux') return 0;
  return fs
    .readFileSync('/proc/self/maps', 'utf8')
    .split('\n')
    .filter(function(line) {
      return line.indexOf(file) !== -1;
    }).length;
}

test('built indexes are freed when collected', async function(t) {
  // One round: 20 indexes x 4000 items x 64 floats, plus 10 trees each,
  // ~2.5 MB of native memory per index -> ~50 MB per round.
  async function round() {
    for (var i = 0; i < 20; i++) {
      var index = new Annoy(DIMS, i % 2 ? 'Angular' : 'Euclidean');
      fill(index);
      index.build(10);
    }
    await settle();
  }
  await round();
  await round();
  var baseline = rssMB();
  for (var r = 0; r < 20; r++) await round(); // ~1 GB allocated in total
  var growth = rssMB() - baseline;
  t.ok(growth < 100, 'RSS growth after ~1 GB of indexes: ' + growth.toFixed(1) + ' MB');
  t.end();
});

test('loaded (mmap) indexes are unmapped when collected', async function(t) {
  var file = path.join(os.tmpdir(), 'annoy-leak-' + process.pid + '.annoy');
  var src = new Annoy(DIMS, 'Angular');
  fill(src);
  src.build(10);
  t.ok(src.save(file));
  src.unload();
  try {
    (function() {
      for (var i = 0; i < 200; i++) {
        var loaded = new Annoy(DIMS, 'Angular');
        loaded.load(file);
      }
    })();
    await settle();
    t.equal(mappedCount(file), 0, 'no mapping of the index file remains');
  } finally {
    fs.unlinkSync(file);
  }
  t.end();
});

test('indexes owned by an exiting worker are freed', async function(t) {
  function runWorker() {
    return new Promise(function(resolve, reject) {
      var w = new Worker(
        [
          'const Annoy = require(' + JSON.stringify(path.join(__dirname, 'load-binding')) + ')();',
          'const keep = [];',
          'for (let n = 0; n < 10; n++) {',
          '  const a = new Annoy(' + DIMS + ', "Euclidean");',
          '  const v = new Array(' + DIMS + ');',
          '  for (let i = 0; i < ' + ITEMS + '; i++) { for (let d = 0; d < ' + DIMS + '; d++) v[d] = Math.cos(i + d); a.addItem(i, v); }',
          '  a.build(10);',
          '  keep.push(a);', // still reachable when the worker exits
          '}',
          'require("worker_threads").parentPort.postMessage(keep.reduce((s, a) => s + a.getNItems(), 0));'
        ].join('\n'),
        { eval: true }
      );
      var count;
      w.on('message', function(m) {
        count = m;
      });
      w.on('error', reject);
      w.on('exit', function() {
        resolve(count);
      });
    });
  }
  t.equal(await runWorker(), 10 * ITEMS, 'worker built its indexes');
  await runWorker();
  await settle();
  var baseline = rssMB();
  for (var i = 0; i < 20; i++) await runWorker(); // ~500 MB of indexes
  await settle();
  var growth = rssMB() - baseline;
  t.ok(growth < 100, 'RSS growth after 20 workers: ' + growth.toFixed(1) + ' MB');
  t.end();
});
