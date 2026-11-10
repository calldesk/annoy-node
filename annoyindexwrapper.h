#ifndef ANNOYINDEXWRAPPER_H
#define ANNOYINDEXWRAPPER_H

#include <napi.h>
#include <memory>
#include "annoylib.h"

// JS class `Annoy`: wraps one AnnoyIndex<int, float, Metric, Kiss64Random>.
//
// The JS-visible contract (argument coercion, defaults, return values, errors)
// is the one of the 4.0.1 NAN wrapper; tests/wrong-input-test.js pins it.
class AnnoyIndexWrapper : public Napi::ObjectWrap<AnnoyIndexWrapper> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  // Called by ObjectWrap for `new Annoy(dimensions, metric)`.
  explicit AnnoyIndexWrapper(const Napi::CallbackInfo& info);

  // `Annoy(...)` without `new` returns undefined, as in 4.0.1.
  static Napi::Value OnCalledAsFunction(const Napi::CallbackInfo& info);

 private:
  // Prototype methods. They are static and look up their receiver themselves
  // (see Receiver) so that a call on a foreign `this` throws the same
  // TypeError as the V8 signature check NAN relied on.
  static Napi::Value AddItem(const Napi::CallbackInfo& info);
  static Napi::Value Build(const Napi::CallbackInfo& info);
  static Napi::Value Save(const Napi::CallbackInfo& info);
  static Napi::Value Load(const Napi::CallbackInfo& info);
  static Napi::Value Unload(const Napi::CallbackInfo& info);
  static Napi::Value GetItem(const Napi::CallbackInfo& info);
  static Napi::Value GetNNSByVector(const Napi::CallbackInfo& info);
  static Napi::Value GetNNSByItem(const Napi::CallbackInfo& info);
  static Napi::Value GetNItems(const Napi::CallbackInfo& info);
  static Napi::Value GetDistance(const Napi::CallbackInfo& info);

  static AnnoyIndexWrapper* Receiver(const Napi::CallbackInfo& info);
  bool getFloatArrayParam(const Napi::CallbackInfo& info, size_t paramIndex,
                          std::vector<float>& vec) const;
  static void getSupplementaryGetNNsParams(const Napi::CallbackInfo& info,
                                           int& numberOfNeighbors, int& searchK,
                                           bool& includeDistances);
  static Napi::Value nnResult(Napi::Env env, int numberOfNeighbors, bool includeDistances,
                              const std::vector<int>& nnIndexes,
                              const std::vector<float>& distances);
  std::vector<float> newVector() const;

  int annoyDimensions;
  // Owned; freed (heap nodes or mmap'd file) when the JS object is collected
  // or the environment (main thread or worker) is torn down.
  std::unique_ptr<AnnoyIndexInterface<int, float>> annoyIndex;
};

#endif
