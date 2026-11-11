/* global process */

// Pins the JS-visible contract of @calldesk/annoy-node 4.0.1 (the NAN
// binding): class shape, argument coercion, defaults and behaviour on wrong
// input. Every expectation below was observed on the 4.0.1 linux-x64
// prebuild under Node 22, and this file must pass against both bindings:
//
//   node tests/wrong-input-test.js                          # new binding
//   ANNOY_BINDING=/path/to/4.0.1.node node tests/wrong-input-test.js
//
// Inputs for which 4.0.1 has undefined behaviour (garbage values, crashes)
// are not here: see tests/undefined-behaviour-test.js.

var test = require('tape');
var fs = require('fs');
var os = require('os');
var path = require('path');
var Annoy = require('./load-binding')();

var METHODS = [
  'addItem',
  'build',
  'save',
  'load',
  'unload',
  'getItem',
  'getNNsByVector',
  'getNNsByItem',
  'getNItems',
  'getDistance'
];

function tmpFile(name) {
  return path.join(os.tmpdir(), 'annoy-wrong-input-' + process.pid + '-' + name);
}

// 4 items in 3 dimensions, Euclidean, built the same way as the 4.0.1 probe.
function makeSmallIndex() {
  var a = new Annoy(3, 'Euclidean');
  a.addItem(0, [1, 2, 3]);
  a.addItem(1, 'not an array'); // ignored
  a.addItem(1, ['4', '5', { valueOf: () => 6 }]); // elements coerced with ToNumber
  a.addItem('2', [7, 8, 9]); // index coerced with ToNumber
  a.addItem(3.9, [1, 1, 1]); // index truncated to 3
  a.build();
  return a;
}

test('class shape', function(t) {
  t.equal(typeof Annoy, 'function');
  t.equal(Annoy.name, 'Annoy');
  t.equal(Annoy.length, 0);
  t.deepEqual(Object.keys(Annoy.prototype), METHODS, 'enumerable prototype methods, in order');
  t.deepEqual(
    Object.getOwnPropertyNames(Annoy.prototype).sort(),
    METHODS.concat('constructor').sort()
  );
  METHODS.forEach(function(name) {
    var d = Object.getOwnPropertyDescriptor(Annoy.prototype, name);
    t.deepEqual(
      { w: d.writable, e: d.enumerable, c: d.configurable, type: typeof d.value, name: d.value.name, length: d.value.length },
      { w: true, e: true, c: true, type: 'function', name: name, length: 0 },
      name + ' descriptor'
    );
  });
  var ctor = Object.getOwnPropertyDescriptor(Annoy.prototype, 'constructor');
  t.equal(ctor.value, Annoy);
  t.equal(ctor.enumerable, false);
  var proto = Object.getOwnPropertyDescriptor(Annoy, 'prototype');
  t.deepEqual({ w: proto.writable, e: proto.enumerable, c: proto.configurable }, { w: true, e: false, c: false });
  t.deepEqual(Object.keys(Annoy), [], 'no enumerable static properties');
  var instance = new Annoy(3, 'Angular');
  t.ok(instance instanceof Annoy);
  t.deepEqual(Object.keys(instance), [], 'instances have no own enumerable properties');
  t.equal(Object.prototype.toString.call(instance), '[object Object]');
  t.end();
});

test('calling the constructor without new returns undefined', function(t) {
  t.equal(Annoy(10, 'Angular'), undefined);
  t.equal(Annoy(), undefined);
  t.end();
});

test('subclassing works', function(t) {
  class Sub extends Annoy {
    count() {
      return this.getNItems();
    }
  }
  var s = new Sub(2);
  s.addItem(0, [1, 1]);
  t.equal(s.count(), 1);
  t.ok(s instanceof Annoy);
  t.ok(s instanceof Sub);
  t.end();
});

test('methods called on a non-Annoy receiver throw TypeError: Illegal invocation', function(t) {
  var receivers = {
    'plain object': {},
    undefined: undefined,
    null: null,
    number: 42,
    'object inheriting from an instance': Object.create(new Annoy(3))
  };
  Object.keys(receivers).forEach(function(label) {
    METHODS.forEach(function(name) {
      t.throws(
        function() {
          Annoy.prototype[name].call(receivers[label], 0, [1, 2, 3]);
        },
        function(err) {
          return err instanceof TypeError && err.message === 'Illegal invocation';
        },
        name + ' on ' + label
      );
    });
  });
  t.end();
});

test('constructor metric selection and coercion', function(t) {
  function distance(dims, metric, a, b) {
    var x = metric === undefined ? new Annoy(dims) : new Annoy(dims, metric);
    x.addItem(0, a);
    x.addItem(1, b);
    return x.getDistance(0, 1);
  }
  t.equal(distance(2, 'Euclidean', [0, 0], [3, 4]), 5);
  t.equal(distance(2, 'Manhattan', [0, 0], [3, 4]), 7);
  t.equal(distance(2, 'Angular', [1, 0], [0, 1]), 1.4142135381698608);
  t.equal(distance(2, 'Angular', [1, 0], [2, 0]), 0, 'Angular ignores norm');
  t.equal(distance(2, 'angular', [1, 0], [2, 0]), 1, 'metric names are case-sensitive: falls back to Euclidean');
  t.equal(distance(2, undefined, [0, 0], [3, 4]), 5, 'default metric is Euclidean');
  t.equal(distance(2, 5, [0, 0], [3, 4]), 5, 'non-string metric is stringified, unknown -> Euclidean');
  t.equal(distance(2, null, [0, 0], [3, 4]), 5);
  t.equal(distance(2, { toString: () => 'Manhattan' }, [0, 0], [3, 4]), 7, 'metric coerced with ToString');
  t.equal(distance('2', 'Euclidean', [0, 0], [3, 4]), 5, 'dimensions coerced with ToNumber');
  t.equal(distance({ valueOf: () => 2 }, 'Manhattan', [0, 0], [3, 4]), 7);
  t.equal(distance(2.9, 'Manhattan', [0, 0], [3, 4]), 7, 'dimensions truncated');

  var x = new Annoy('2', 'Euclidean');
  x.addItem(0, [3, 4]);
  t.deepEqual(x.getItem(0), [3, 4]);

  t.throws(
    function() {
      new Annoy(2, Symbol('m'));
    },
    function(err) {
      return err instanceof TypeError && err.message === 'Cannot convert a Symbol value to a string';
    },
    'Symbol metric throws TypeError'
  );
  t.end();
});

test('addItem, getItem and getNItems coercion', function(t) {
  var a = new Annoy(3, 'Euclidean');
  t.equal(a.addItem(0, [1, 2, 3]), undefined, 'addItem returns undefined');
  t.equal(a.addItem(1, 'abc'), undefined, 'non-array vector ignored');
  t.equal(a.addItem(1), undefined, 'missing vector ignored');
  t.equal(a.addItem(1, { length: 3, 0: 1, 1: 2, 2: 3 }), undefined, 'array-like ignored');
  t.equal(a.getNItems(), 1);
  a.addItem(1, ['4', '5', { valueOf: () => 6 }]);
  t.deepEqual(a.getItem(1), [4, 5, 6]);
  t.deepEqual(a.getItem(), [4, 5, 6], 'getItem() defaults to index 1');
  a.addItem('2', [7, 8, 9]);
  a.addItem(3.9, [1, 1, 1]);
  t.equal(a.getNItems(), 4);
  t.deepEqual(a.getItem(3), [1, 1, 1]);
  t.deepEqual(a.getItem('2'), [7, 8, 9]);
  t.deepEqual(a.getItem(0.5), [1, 2, 3]);
  t.deepEqual(a.getItem(0), [1, 2, 3]);
  t.deepEqual(a.getItem(1), [4, 5, 6]);
  t.equal(typeof a.getNItems(), 'number');
  t.equal(a.getItem(0.1).length, 3, 'getItem returns a dimension-length array');
  a.addItem(undefined, [2, 2, 2]);
  t.deepEqual(a.getItem(1), [2, 2, 2], 'addItem(undefined, v) writes item 1');
  t.equal(a.build(), undefined, 'build returns undefined');
  t.equal(a.getNItems(), 4);
  t.end();
});

test('getDistance coercion', function(t) {
  var a = makeSmallIndex();
  t.equal(a.getDistance(0, 1), 5.196152210235596);
  t.equal(a.getDistance(), 0, 'getDistance() compares item 0 with itself');
  t.equal(a.getDistance('0', '2'), 10.392304420471191);
  t.equal(a.getDistance(0, 2), 10.392304420471191);
  t.equal(a.getDistance(2), a.getDistance(2, 0), 'missing second index defaults to 0');
  t.equal(typeof a.getDistance(0, 1), 'number');
  t.end();
});

test('getNNsByVector / getNNsByItem argument handling', function(t) {
  var a = makeSmallIndex();
  var all = {
    neighbors: [0, 3, 1, 2],
    distances: [0, 2.2360680103302, 5.196152210235596, 10.392304420471191]
  };
  t.deepEqual(a.getNNsByVector([1, 2, 3], 4, -1, false), all.neighbors);
  t.ok(Array.isArray(a.getNNsByVector([1, 2, 3], 4, -1, false)));
  t.deepEqual(a.getNNsByVector([1, 2, 3], 4, -1, true), all);
  t.deepEqual(Object.keys(a.getNNsByVector([1, 2, 3], 4, -1, true)), ['neighbors', 'distances']);
  t.deepEqual(a.getNNsByVector([1, 2, 3]), [0], 'default n = 1');
  t.deepEqual(a.getNNsByVector([1, 2, 3], 2, undefined, 'yes'), { neighbors: [0, 3], distances: [0, 2.2360680103302] }, 'truthy includeDistances');
  t.deepEqual(a.getNNsByVector([1, 2, 3], 2, -1, 0), [0, 3], 'falsy includeDistances');
  t.deepEqual(a.getNNsByVector([1, 2, 3], 2, -1, null), [0, 3]);
  t.deepEqual(a.getNNsByVector([1, 2, 3], '2', '-1', 1), { neighbors: [0, 3], distances: [0, 2.2360680103302] }, 'n and search_k coerced');
  t.deepEqual(a.getNNsByVector(['1', '2', '3'], 2), [0, 3], 'vector elements coerced');
  t.deepEqual(a.getNNsByVector([1, 2, 3], 2, 100), [0, 3], 'explicit search_k');
  t.equal(a.getNNsByVector('x', 2), undefined, 'non-array vector -> undefined');
  t.equal(a.getNNsByVector(), undefined, 'no vector -> undefined');
  t.deepEqual(a.getNNsByVector([1, 2, 3], 0, -1, true), { neighbors: [], distances: [] }, 'n = 0');
  t.deepEqual(a.getNNsByVector([1, 2, 3], 0), [], 'n = 0 without distances');
  t.deepEqual(a.getNNsByVector([1, 2, 3], -2, -1, true), { neighbors: [], distances: [] }, 'negative n');

  t.deepEqual(a.getNNsByItem(0, 4, -1, true), all);
  t.deepEqual(a.getNNsByItem(0, 4), all.neighbors);
  t.deepEqual(a.getNNsByItem('0', '2'), [0, 3], 'index and n coerced');
  t.deepEqual(a.getNNsByItem(null, 2), [0, 3], 'null index -> 0');
  t.deepEqual(a.getNNsByItem(0), [0], 'default n = 1');
  t.equal(a.getNNsByItem(), undefined, 'missing index -> undefined');
  t.equal(a.getNNsByItem(undefined, 3, -1, true), undefined, 'undefined index -> undefined');
  t.end();
});

test('coercion side effects run in the 4.0.1 order', function(t) {
  var a = makeSmallIndex();
  var log = [];
  function spy(name, value) {
    return {
      valueOf: function() {
        log.push(name);
        return value;
      }
    };
  }
  a.getNNsByVector([spy('v0', 1), spy('v1', 2), spy('v2', 3)], spy('n', 2), spy('k', -1), true);
  t.deepEqual(log, ['n', 'k', 'v0', 'v1', 'v2'], 'getNNsByVector: n, search_k, then vector');
  log = [];
  a.getNNsByItem(spy('i', 0), spy('n', 2), spy('k', -1));
  t.deepEqual(log, ['i', 'n', 'k'], 'getNNsByItem: index, n, search_k');
  log = [];
  a.getDistance(spy('a', 0), spy('b', 1));
  t.deepEqual(log, ['a', 'b']);
  log = [];
  var b = new Annoy(2);
  b.addItem(spy('i', 0), [spy('x', 1), spy('y', 2)]);
  t.deepEqual(log, ['i', 'x', 'y'], 'addItem: index then vector');
  t.end();
});

test('save / load / unload', function(t) {
  var a = makeSmallIndex();
  var file = tmpFile('ok.annoy');
  var viaToString = tmpFile('tostring.annoy');
  try {
    t.equal(a.save(), false, 'save() without a path -> false');
    t.equal(a.save(undefined), false);
    t.equal(a.save('/nonexistent-dir-annoy/x.annoy'), false, 'unwritable path -> false');
    t.throws(
      function() {
        a.save(Symbol('s'));
      },
      function(err) {
        return err instanceof TypeError && err.message === 'Cannot convert a Symbol value to a string';
      },
      'Symbol path throws TypeError'
    );
    t.equal(a.save(file), true);
    t.equal(a.save({ toString: () => viaToString }), true, 'path coerced with ToString');
    t.ok(fs.existsSync(viaToString));

    var b = new Annoy(3, 'Euclidean');
    t.equal(b.load(), false, 'load() without a path -> false');
    t.equal(b.load('/nonexistent-annoy-file.annoy'), false, 'missing file -> false');
    t.throws(
      function() {
        b.load(Symbol('s'));
      },
      function(err) {
        return err instanceof TypeError && err.message === 'Cannot convert a Symbol value to a string';
      }
    );
    t.equal(b.load(file), true);
    t.equal(b.getNItems(), 4);
    t.deepEqual(b.getNNsByVector([1, 2, 3], 4, -1, true), a.getNNsByVector([1, 2, 3], 4, -1, true));
    t.equal(b.unload(), undefined, 'unload returns undefined');
    t.equal(b.getNItems(), 0, 'unloaded index is empty');
    t.equal(b.unload(), undefined, 'unload twice is harmless');
    t.equal(b.load({ toString: () => viaToString }), true);
    t.equal(b.getNItems(), 4);
    t.equal(typeof b.load(file), 'boolean');
  } finally {
    [file, viaToString].forEach(function(f) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }
  t.end();
});

test('many instances can be created and collected', function(t) {
  for (var i = 0; i < 2000; i++) {
    var x = new Annoy(8, i % 2 ? 'Angular' : 'Manhattan');
    x.addItem(0, [1, 2, 3, 4, 5, 6, 7, 8]);
    x.build(2);
  }
  t.pass('no crash');
  t.end();
});
