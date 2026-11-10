// Inputs on which the 4.0.1 NAN wrapper had undefined behaviour. 4.0.1
// returned uninitialised memory or crashed the process on all of these, so
// there is no "old" value to match; 5.x defines them as below. This file only
// runs against the new binding.
//
// Observed on 4.0.1 (linux-x64, Node 22):
// - asking for more neighbours than the index can return gave arrays of the
//   requested length padded with garbage ids/distances read past the end of
//   a std::vector;
// - querying an index that was never built or loaded crashed (SIGSEGV);
// - a vector shorter than the dimensions read uninitialised stack memory for
//   the missing components, a longer one wrote past a stack buffer.

var test = require('tape');
var Annoy = require('./load-binding')();

function threeItems() {
  var a = new Annoy(3, 'Euclidean');
  a.addItem(0, [1, 2, 3]);
  a.addItem(1, [4, 5, 6]);
  a.addItem(2, [7, 8, 9]);
  a.build();
  return a;
}

test('more neighbours requested than available: only real results are returned', function(t) {
  var a = threeItems();
  t.deepEqual(a.getNNsByVector([1, 2, 3], 10, -1, true), {
    neighbors: [0, 1, 2],
    distances: [0, 5.196152210235596, 10.392304420471191]
  });
  t.deepEqual(a.getNNsByVector([1, 2, 3], 10), [0, 1, 2]);
  t.deepEqual(a.getNNsByItem(0, 6, -1, false), [0, 1, 2]);
  t.deepEqual(a.getNNsByItem(0, 6, -1, true).distances.length, 3);
  t.end();
});

test('querying an index that has no trees returns empty results', function(t) {
  var u = new Annoy(3, 'Euclidean');
  t.deepEqual(u.getNNsByVector([1, 2, 3], 2, -1, true), { neighbors: [], distances: [] });
  t.deepEqual(u.getNNsByVector([1, 2, 3], 2), []);
  var unloaded = threeItems();
  unloaded.unload();
  t.deepEqual(unloaded.getNNsByVector([1, 2, 3], 2), []);
  t.end();
});

test('short vectors are zero-padded, extra components are ignored', function(t) {
  var a = threeItems();
  t.deepEqual(a.getNNsByVector([1, 2], 2, -1, true), {
    neighbors: [0, 1],
    distances: [3, 7.348469257354736]
  });
  t.deepEqual(a.getNNsByVector([], 1, -1, true).neighbors, [0]);
  t.deepEqual(a.getNNsByVector([1, 2, 3, 4, 5, 6, 7, 8], 2, -1, true), {
    neighbors: [0, 1],
    distances: [0, 5.196152210235596]
  });

  var b = new Annoy(3, 'Euclidean');
  b.addItem(0, [5]);
  t.deepEqual(b.getItem(0), [5, 0, 0]);
  b.addItem(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  t.deepEqual(b.getItem(1), [1, 2, 3]);

  var seen = [];
  b.addItem(2, [1, 2, 3, { valueOf: () => (seen.push('extra'), 4) }]);
  t.deepEqual(seen, ['extra'], 'extra components are still coerced, as in 4.0.1');
  t.end();
});

test('errors thrown while coercing arguments propagate as JS exceptions', function(t) {
  // 4.0.1 aborted the process (Maybe::FromJust on an empty value).
  var a = threeItems();
  var boom = {
    valueOf: function() {
      throw new RangeError('boom');
    }
  };
  [
    function() { new Annoy(boom); },
    function() { a.addItem(boom, [1, 2, 3]); },
    function() { a.addItem(0, [1, boom, 3]); },
    function() { a.getItem(boom); },
    function() { a.build(boom); },
    function() { a.getDistance(0, boom); },
    function() { a.getNNsByVector([1, 2, 3], boom); },
    function() { a.getNNsByVector([boom, 2, 3], 2); },
    function() { a.getNNsByItem(boom, 2); },
    function() { a.getNNsByItem(0, 2, boom); }
  ].forEach(function(fn, i) {
    t.throws(fn, /boom/, 'case ' + i);
  });
  t.throws(function() { a.getNNsByItem(0, Symbol('n')); }, TypeError, 'Symbol -> TypeError');
  t.deepEqual(a.getNNsByVector([1, 2, 3], 2), [0, 1], 'index still usable afterwards');
  t.end();
});
