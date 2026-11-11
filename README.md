annoy-node
==================

[![Build Status](https://travis-ci.org/jimkang/annoy-node.svg?branch=master)](https://travis-ci.org/jimkang/annoy-node)

Node bindings for [Annoy](https://github.com/spotify/annoy), an efficient Approximate Nearest Neighbors implementation written in C++.

**Version 5.0.0** (@calldesk fork): the binding is written against [N-API](https://nodejs.org/api/n-api.html) through [node-addon-api](https://github.com/nodejs/node-addon-api) (`NAPI_VERSION=10`, the latest stable Node-API) instead of NAN. One binary per platform loads on every Node.js release with Node-API 10 (Node >= 22.14; tested on 22, 24 and 26). The package only serves bot-api, which follows the AWS Lambda Node.js runtime, so it targets the current Node-API rather than older Node releases; nothing is compiled on install where a prebuild exists. JS API, results and the on-disk index format are unchanged from 4.0.1 (see "Compatibility with 4.x" below), with two additions: numeric typed arrays are accepted as vectors, and index memory is reported to V8.

Status: Tests pass, including one that loads 3 million vectors, but API coverage is not complete. Run on OS X and Linux with Node 8, 10, and 12. Not tried on Windows yet. Support for Node 6.3 and 4.6 ended at version 2.0.1 of this package.

All of the [Python API](https://github.com/spotify/annoy#full-python-api) methods are implemented. The names are camel cased, JavaScript-style.

  - `addItem`
  - `build`
  - `save`
  - `load`
  - `unload`
  - `getItem`
  - `getNNsByVector`
  - `getNNsByItem`
  - `getNItems`
  - `getDistance`

There are a few minor differences in behavior:

- If you set the "include distances" param (the fourth param) when calling `getNNsByVector` and `getNNsByItem`, rather than returning a 2D array containing the neighbors and distances, it will return an object with the properties `neighbors` and `distances`, each of which is an array.
- `get_item_vector` in with the Python API is just called `getItem` here.

Installation
------------

    npm install @calldesk/annoy-node

Prebuilds ship for:

| Platform | Built in | Notes |
|---|---|---|
| `linux-x64` | `public.ecr.aws/lambda/nodejs:22` (amd64) | glibc >= 2.14 |
| `linux-arm64` | `public.ecr.aws/lambda/nodejs:22` (arm64) | glibc >= 2.17 |
| `darwin-arm64`, `darwin-x64` | GitHub Actions macOS runners | built by `.github/workflows/prebuild.yml`; **not committed yet**: the 4.0.1 NAN darwin-arm64 prebuild was removed (it only loaded on Node 22), run the workflow and add its output before publishing 5.0.0 |

Elsewhere (Windows, musl/Alpine, other architectures) `npm install` falls back to compiling with node-gyp, which needs Python and a C++ toolchain.

### How prebuilds are built

The Linux prebuilds are compiled inside the AWS Lambda `nodejs:22` image (Amazon Linux 2023, glibc 2.34) so they never need a newer glibc or libstdc++ than the Lambda runtime. Never commit a `.node` file compiled on a workstation: a recent distribution links against symbols the Lambda does not have (e.g. `sqrtf@GLIBC_2.43`).

    npm run prebuild:linux      # linux-x64 + linux-arm64 via Docker buildx (arm64 under QEMU), then the symbol check
    npm run check:prebuilds     # fails if a Linux prebuild needs > GLIBC_2.34 or > GLIBCXX_3.4.33

Both Docker builds run the smoke tests inside the Lambda image. The darwin prebuilds (and all four, with tests on Node 22/24/26) are built by the `prebuild` GitHub Actions workflow: download its `prebuilds` artifact into `prebuilds/` before publishing.

### Compatibility with 4.x

- Same class, methods, argument coercion, defaults, return values and errors; `tests/wrong-input-test.js` passes against both the 4.0.1 NAN binary and 5.0.0.
- Bit-identical results and `.annoy` files: `tests/equivalence-test.js` compares 5.0.0 with the 4.0.1 prebuild (`make equivalence-test REFERENCE_BINDING=... REFERENCE_NODE=<node 22>`). Indexes saved by either version load in the other.
- **Behaviour change: typed arrays are accepted as vectors.** `addItem` and `getNNsByVector` take a `Float32Array` (copied directly, no per-component conversion) or any other numeric typed array, with the same results as the equivalent `Array` (`tests/typed-array-test.js`). 4.0.1 ignored them: `addItem` added nothing and `getNNsByVector` returned `undefined`. BigInt arrays are still ignored. On 5000 vectors of 200 dimensions, `addItem` with `Float32Array` takes 2.6 ms instead of 46.6 ms with arrays, and `getNNsByVector` saves ~8 µs per query.
- **Index memory is reported to V8** (`napi_adjust_external_memory`): the heap nodes of a built index or the mapped file of a loaded one. The GC now collects indexes that are no longer referenced; with 4.0.1 a process loading a fresh index per request kept every dropped mapping until an unrelated GC (`tests/external-memory-test.js`: 1000 loads of a 4 MB index keep ~20 alive instead of ~360).
- Inputs that were undefined behaviour in 4.0.1 are now defined (`tests/undefined-behaviour-test.js`): asking for more neighbours than available returns only the real results (4.0.1 padded with garbage), querying an index without trees returns empty arrays (4.0.1 crashed), short vectors are zero-padded, and exceptions thrown while coercing arguments propagate to JS (4.0.1 aborted the process).

Usage
-----

    var Annoy = require('annoy');
    var annoyIndex1 = new Annoy(10, 'Angular');

    annoyIndex1.addItem(0, [-5.0, -4.5, -3.2, -2.8, -2.1, -1.5, -0.34, 0, 3.7, 6]);
    annoyIndex1.addItem(1, [5.0, 4.5, 3.2, 2.8, 2.1, 1.5, 0.34, 0, -3.7, -6]);
    annoyIndex1.addItem(2, [0, 0, 0, 0, 0, -1, -1, -0.2, 0.1, 0.8]);
    annoyIndex1.build();
    annoyIndex1.save(annoyPath);

    read();

    function read() {
      var annoyIndex2 = new Annoy(10, 'Angular');

      if (annoyIndex2.load(annoyPath)) {
        var v1 = annoyIndex2.getItem(0);
        var v2 = annoyIndex2.getItem(1);
        console.log('Gotten vectors:', v1, v2);

          for (var i = 0; i < v1.length; ++i) {
            sum.push(v1[i] + v2[i]);
          }

          var neighbors = annoyIndex2.getNNsByVector(sum, 10, -1, false);
          console.log('Nearest neighbors to sum', neighbors);

          var neighborsAndDistances = annoyIndex2.getNNsByVector(sum, 10, -1, true);
          console.log('Nearest neighbors to sum with distances', neighborsAndDistances);
      }
    }

Development
------------

    npm ci
    npx node-gyp rebuild    # local build in build/Release, preferred over prebuilds by node-gyp-build

Remove `build/` to test the prebuilds again. Run `eslint .` and `make prettier` before committing.

Tests
-----

Run tests with `make test`.

You can also run tests individually:

- This is a short baseline test: `node tests/smalltest.js`
- This is a test that uses 70K 200-dimension vectors: `node tests/basictests.js basic-config.js`
- Typed array vectors (5.0.0): `node tests/typed-array-test.js`
- External memory reporting (5.0.0): `node tests/external-memory-test.js`
- API contract and wrong input, identical to 4.0.1: `node tests/wrong-input-test.js` (set `ANNOY_BINDING=<file.node>` to run it against another binary)
- Native memory is released: `node --expose-gc tests/leak-test.js`
- Equivalence with 4.0.1: `make equivalence-test REFERENCE_BINDING=<4.0.1 linux-x64 .node> REFERENCE_NODE=<node 22 binary>` (the 4.0.1 file is in git history at commit `dd317b0`)

There is also a `big-test` target that is not a dependency of the `test` target. It loads about 3 million 300-dimension vectors. It takes about six minutes to run on good-for-2016 hardware. Before you can run it, you need to download [GoogleNews-vectors-negative300.bin](https://drive.google.com/file/d/0B7XkCwpI5KDYNlNUTTlSS21pQmM/edit?usp=sharing) to `tests/data`.

Then, you can run `make tests/data/GoogleNews-vectors-negative300.json`, which takes a while, and gets the test data ready for the big test. (See comment about running that in the Makefile.) Then, `make big-test`.

Contributors
------------

Thanks to:

- [mbuszka](https://github.com/mbuszka) for [updating the wrapper to the latest Annoy (with Manhattan distance) and updating the random number generator](https://github.com/jimkang/annoy-node/pull/4).
- [aaaton](https://github.com/aaaton) for [updating the example code so that it works](https://github.com/jimkang/annoy-node/pull/1).
- [kornesh](https://github.com/kornesh) for [updating annoylib.h](https://github.com/jimkang/annoy-node/pull/10) to match the [Annoy of 2020-07-19](https://github.com/spotify/annoy/commit/7f2562add33eeb217dcdc755520c201aefc1b021).
- [Benjaminrivard](https://github.com/Benjaminrivard) for [updating the wrapper for Node 14](https://github.com/jimkang/annoy-node/pull/13) and testing the thread support.
- [S4N0I](https://github.com/S4N0I) for adding context-awareness so that it can be used in threads.

License
-------

The MIT License (MIT)

Copyright (c) 2016 Jim Kang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
