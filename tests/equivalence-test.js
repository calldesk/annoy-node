/* global __dirname process */

// Equivalence between the 4.0.1 NAN binding and the binding under test.
//
//   ANNOY_REFERENCE_BINDING=/path/to/annoy-4.0.1-linux-x64.node \
//   ANNOY_REFERENCE_NODE=/path/to/node22/bin/node \
//   node tests/equivalence-test.js
//
// The reference is a NAN build for one Node ABI (22), so it runs in a child
// process under ANNOY_REFERENCE_NODE (default: the current node). The binding
// under test runs under the current node; it defaults to whatever index.js
// loads (node-gyp-build), override with ANNOY_BINDING.
//
// For 12 indexes (Angular/Euclidean/Manhattan x 3/16/64/200 dimensions,
// 3000 items, 10 trees) it requires, with no tolerance:
//   1. identical neighbour ids and distances, items and getDistance values
//      from indexes built by each binding;
//   2. byte-identical .annoy files;
//   3. an index saved by one binding, loaded by the other, gives the same
//      results as the original (both directions).

var test = require('tape');
var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var childProcess = require('child_process');
var cases = require('./equivalence/cases');

var referenceBinding = process.env.ANNOY_REFERENCE_BINDING;
var referenceNode = process.env.ANNOY_REFERENCE_NODE || process.execPath;
var bindingUnderTest =
  process.env.ANNOY_BINDING || require('node-gyp-build').path(path.join(__dirname, '..'));
var runner = path.join(__dirname, 'equivalence', 'runner.js');

function run(node, args) {
  var r = childProcess.spawnSync(node, [runner].concat(args), { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(node + ' ' + args.join(' ') + ' failed (' + (r.status === null ? r.signal : r.status) + '):\n' + r.stderr);
  }
}

function read(dir, name, mode) {
  return JSON.parse(fs.readFileSync(path.join(dir, name + '.' + mode + '.json'), 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// Walks two JSON values in parallel, counts compared leaves and collects
// mismatches. Numbers are compared with Object.is (exact, NaN-safe).
function compare(expected, actual, where, stats) {
  if (typeof expected === 'number' || typeof actual === 'number') {
    stats.compared++;
    if (!Object.is(expected, actual)) stats.mismatches.push(where + ': ' + expected + ' !== ' + actual);
    return;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
      stats.mismatches.push(where + ': shape differs');
      return;
    }
    for (var i = 0; i < expected.length; i++) compare(expected[i], actual[i], where + '[' + i + ']', stats);
    return;
  }
  if (expected && typeof expected === 'object') {
    var keys = Object.keys(expected);
    if (!actual || typeof actual !== 'object' || keys.join() !== Object.keys(actual).join()) {
      stats.mismatches.push(where + ': keys differ');
      return;
    }
    keys.forEach(function(k) {
      compare(expected[k], actual[k], where + '.' + k, stats);
    });
    return;
  }
  stats.compared++;
  if (expected !== actual) stats.mismatches.push(where + ': ' + expected + ' !== ' + actual);
}

test('equivalence with the 4.0.1 NAN binding', { skip: !referenceBinding }, function(t) {
  var work = fs.mkdtempSync(path.join(os.tmpdir(), 'annoy-equivalence-'));
  var dirs = {
    refBuild: path.join(work, 'ref-build'),
    newBuild: path.join(work, 'new-build'),
    refLoadsNew: path.join(work, 'ref-loads-new'),
    newLoadsRef: path.join(work, 'new-loads-ref')
  };
  try {
    t.comment('reference: ' + referenceBinding + ' under ' + referenceNode);
    t.comment('under test: ' + bindingUnderTest + ' under ' + process.execPath + ' (' + process.version + ')');
    run(referenceNode, ['build', referenceBinding, dirs.refBuild]);
    run(process.execPath, ['build', bindingUnderTest, dirs.newBuild]);
    run(referenceNode, ['load', referenceBinding, dirs.refLoadsNew, dirs.newBuild]);
    run(process.execPath, ['load', bindingUnderTest, dirs.newLoadsRef, dirs.refBuild]);

    var totals = { compared: 0, mismatches: 0, neighbourLists: 0 };
    cases.all().forEach(function(c) {
      var expected = read(dirs.refBuild, c.name, 'build');
      t.equal(expected.nItems, c.nItems, c.name + ': reference index has every item');
      [
        ['new build', read(dirs.newBuild, c.name, 'build')],
        ['reference loading new file', read(dirs.refLoadsNew, c.name, 'load')],
        ['new loading reference file', read(dirs.newLoadsRef, c.name, 'load')]
      ].forEach(function(pair) {
        var stats = { compared: 0, mismatches: [] };
        compare(expected, pair[1], c.name, stats);
        totals.compared += stats.compared;
        totals.mismatches += stats.mismatches.length;
        t.deepEqual(stats.mismatches.slice(0, 5), [], c.name + ' / ' + pair[0] + ': ' + stats.compared + ' values identical');
      });
      totals.neighbourLists += 3 * (expected.byItem.length + expected.byVector.length) * 3;
      t.equal(
        sha256(path.join(dirs.newBuild, c.name + '.annoy')),
        sha256(path.join(dirs.refBuild, c.name + '.annoy')),
        c.name + ': .annoy files are byte-identical'
      );
    });
    t.comment(
      'compared ' + totals.compared + ' values (' + totals.neighbourLists + ' neighbour lists) across ' +
        cases.all().length + ' indexes, ' + totals.mismatches + ' mismatches'
    );
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  t.end();
});
