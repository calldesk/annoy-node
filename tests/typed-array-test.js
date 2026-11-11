// 5.0.0: numeric typed arrays are accepted as vectors by addItem and
// getNNsByVector, read straight from their backing store (4.0.1 ignored them).
// They give the same results as the equivalent JS Array.
//
//   node tests/typed-array-test.js
var test = require('tape');
var Annoy = require('./load-binding')();

var ITEMS = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [1, 1, 1]];

function indexFrom(toVector) {
  var a = new Annoy(3, 'Euclidean');
  ITEMS.forEach(function(v, i) {
    a.addItem(i, toVector(v));
  });
  a.build(10);
  return a;
}

test('addItem stores typed arrays like arrays', function(t) {
  var reference = indexFrom(function(v) { return v; });
  [Float32Array, Float64Array, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array]
    .forEach(function(Type) {
      var a = indexFrom(function(v) { return new Type(v); });
      t.equal(a.getNItems(), ITEMS.length, Type.name + ': every item added');
      t.deepEqual(a.getItem(1), reference.getItem(1), Type.name + ': same stored vector');
      t.deepEqual(a.getNNsByVector([1, 2, 3], 4, -1, true), reference.getNNsByVector([1, 2, 3], 4, -1, true),
        Type.name + ': same neighbours and distances');
    });
  t.end();
});

test('getNNsByVector accepts typed arrays', function(t) {
  var a = indexFrom(function(v) { return v; });
  [Float32Array, Float64Array, Int32Array].forEach(function(Type) {
    t.deepEqual(a.getNNsByVector(new Type([1, 2, 3]), 2, -1, true), a.getNNsByVector([1, 2, 3], 2, -1, true),
      Type.name + ': same result as the array');
  });
  t.end();
});

test('length mismatches follow the Array rules', function(t) {
  var a = new Annoy(3, 'Euclidean');
  a.addItem(0, new Float32Array([1, 2])); // missing component stays 0
  a.addItem(1, new Float32Array([4, 5, 6, 7])); // extra component ignored
  t.deepEqual(a.getItem(0), [1, 2, 0], 'short vector padded with 0');
  t.deepEqual(a.getItem(1), [4, 5, 6], 'long vector truncated');
  t.end();
});

test('typed array views use their own window of the buffer', function(t) {
  var a = new Annoy(3, 'Euclidean');
  var buffer = new Float32Array([9, 9, 1, 2, 3, 9]).buffer;
  a.addItem(0, new Float32Array(buffer, 2 * 4, 3));
  var bytes = new Uint8Array([0, 0, 7, 8, 9]);
  a.addItem(1, bytes.subarray(2));
  t.deepEqual(a.getItem(0), [1, 2, 3], 'Float32Array view with an offset');
  t.deepEqual(a.getItem(1), [7, 8, 9], 'Uint8Array subarray');
  t.end();
});

test('BigInt arrays are still ignored', function(t) {
  var a = new Annoy(3, 'Euclidean');
  t.equal(a.addItem(0, new BigInt64Array([1n, 2n, 3n])), undefined);
  t.equal(a.getNItems(), 0, 'not added');
  a.addItem(0, [1, 2, 3]);
  a.build(1);
  t.equal(a.getNNsByVector(new BigUint64Array([1n, 2n, 3n]), 1), undefined, 'getNNsByVector -> undefined');
  t.end();
});
