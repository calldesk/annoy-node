#include <napi.h>
#include "annoyindexwrapper.h"

// Context-aware by construction (NODE_API_MODULE): the addon keeps no
// per-process JS state, so it can be loaded in several worker threads.
Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  return AnnoyIndexWrapper::Init(env, exports);
}

NODE_API_MODULE(addon, InitAll)
