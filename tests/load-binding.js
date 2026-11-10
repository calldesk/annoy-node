/* global process */

// Returns the Annoy class under test.
//
// By default this is the package entry point (index.js, loaded through
// node-gyp-build). Set ANNOY_BINDING to the path of a raw .node file (for
// example the 4.0.1 NAN prebuild) to run the same assertions against another
// binary. A raw addon exports { Annoy }, index.js exports Annoy directly.
module.exports = function loadAnnoy() {
  if (process.env.ANNOY_BINDING) {
    return require(process.env.ANNOY_BINDING).Annoy;
  }
  return require('../index');
};
