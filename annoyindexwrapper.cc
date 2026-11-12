#include "annoyindexwrapper.h"
#include "kissrandom.h"
#include <cstring>
#include <string>
#include <vector>

namespace {

// Marks objects constructed by this class, so that prototype methods can
// reject any other receiver (napi_type_tag_object, N-API 8).
const napi_type_tag kAnnoyTypeTag = {0x5c1b0f3e9d2a4c71ULL, 0xa6e84d02b7f3195cULL};

const napi_property_attributes kMethodAttributes = static_cast<napi_property_attributes>(
    napi_writable | napi_enumerable | napi_configurable);

// 4.0.1 read integers as `int x = undefined ? default : ToNumber(v)`, i.e. a
// double truncated to int. Keep the exact same conversion.
double numberOr(const Napi::Value& value, double defaultValue) {
  return value.IsUndefined() ? defaultValue : value.ToNumber().DoubleValue();
}

// Converts the first `count` elements of a typed array to float, as
// ToNumber then a float cast would for the same values in an Array.
template <typename T>
void copyTypedArray(const T* data, size_t count, std::vector<float>& vec) {
  for (size_t i = 0; i < count; ++i) {
    vec[i] = static_cast<float>(static_cast<double>(data[i]));
  }
}

// Node-API 10: an internalized string, which V8 uses as a property key without
// converting it on every Set.
Napi::Value propertyKey(Napi::Env env, const char* name) {
  napi_value key;
  NAPI_THROW_IF_FAILED(env, node_api_create_property_key_utf8(env, name, NAPI_AUTO_LENGTH, &key),
                       Napi::Value());
  return Napi::Value(env, key);
}

}  // namespace

Napi::Object AnnoyIndexWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function ctor = DefineClass(env, "Annoy", {});

  // Same names, order and attributes (writable, enumerable, configurable) as
  // Nan::SetPrototypeMethod produced in 4.0.1.
  Napi::Object proto = ctor.Get("prototype").As<Napi::Object>();
  proto.DefineProperties({
      Napi::PropertyDescriptor::Value("addItem", Napi::Function::New<AddItem>(env, "addItem"), kMethodAttributes),
      Napi::PropertyDescriptor::Value("build", Napi::Function::New<Build>(env, "build"), kMethodAttributes),
      Napi::PropertyDescriptor::Value("save", Napi::Function::New<Save>(env, "save"), kMethodAttributes),
      Napi::PropertyDescriptor::Value("load", Napi::Function::New<Load>(env, "load"), kMethodAttributes),
      Napi::PropertyDescriptor::Value("unload", Napi::Function::New<Unload>(env, "unload"), kMethodAttributes),
      Napi::PropertyDescriptor::Value("getItem", Napi::Function::New<GetItem>(env, "getItem"), kMethodAttributes),
      Napi::PropertyDescriptor::Value("getNNsByVector", Napi::Function::New<GetNNSByVector>(env, "getNNsByVector"), kMethodAttributes),
      Napi::PropertyDescriptor::Value("getNNsByItem", Napi::Function::New<GetNNSByItem>(env, "getNNsByItem"), kMethodAttributes),
      Napi::PropertyDescriptor::Value("getNItems", Napi::Function::New<GetNItems>(env, "getNItems"), kMethodAttributes),
      Napi::PropertyDescriptor::Value("getDistance", Napi::Function::New<GetDistance>(env, "getDistance"), kMethodAttributes),
  });

  exports.Set("Annoy", ctor);
  return exports;
}

Napi::Value AnnoyIndexWrapper::OnCalledAsFunction(const Napi::CallbackInfo& info) {
  return info.Env().Undefined();
}

AnnoyIndexWrapper::AnnoyIndexWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<AnnoyIndexWrapper>(info) {
  // Coerce both arguments before allocating anything: if a coercion throws,
  // nothing has to be released.
  double dimensions = numberOr(info[0], 0);
  std::string metric;
  if (!info[1].IsUndefined()) {
    metric = info[1].ToString().Utf8Value();
  }

  annoyDimensions = (int)dimensions;
  // strcmp on the C string, as 4.0.1 did (stops at an embedded NUL).
  if (strcmp(metric.c_str(), "Angular") == 0) {
    annoyIndex.reset(new AnnoyIndex<int, float, Angular, Kiss64Random>(annoyDimensions));
  } else if (strcmp(metric.c_str(), "Manhattan") == 0) {
    annoyIndex.reset(new AnnoyIndex<int, float, Manhattan, Kiss64Random>(annoyDimensions));
  } else {
    annoyIndex.reset(new AnnoyIndex<int, float, Euclidean, Kiss64Random>(annoyDimensions));
  }

  info.This().As<Napi::Object>().TypeTag(&kAnnoyTypeTag);
}

AnnoyIndexWrapper* AnnoyIndexWrapper::Receiver(const Napi::CallbackInfo& info) {
  Napi::Value self = info.This();
  if (!self.IsObject() || !self.As<Napi::Object>().CheckTypeTag(&kAnnoyTypeTag)) {
    throw Napi::TypeError::New(info.Env(), "Illegal invocation");
  }
  return Unwrap(self.As<Napi::Object>());
}

std::vector<float> AnnoyIndexWrapper::newVector() const {
  // Zero-filled: 4.0.1 left components missing from a short JS array
  // uninitialised. Never empty, so data() is always a valid pointer.
  return std::vector<float>(annoyDimensions > 0 ? annoyDimensions : 1, 0.0f);
}

void AnnoyIndexWrapper::syncExternalMemory(Napi::Env env) {
  int64_t current = static_cast<int64_t>(annoyIndex->get_memory_size());
  int64_t change = current - reportedExternalMemory;
  if (change != 0) {
    Napi::MemoryManagement::AdjustExternalMemory(env, change);
    reportedExternalMemory = current;
  }
}

void AnnoyIndexWrapper::Finalize(Napi::Env env) {
  // Runs before the destructor frees the index. Raw call, status ignored: the
  // environment may be tearing down, and a failure here must not abort.
  if (reportedExternalMemory != 0) {
    int64_t ignored;
    napi_adjust_external_memory(env, -reportedExternalMemory, &ignored);
    reportedExternalMemory = 0;
  }
}

Napi::Value AnnoyIndexWrapper::AddItem(const Napi::CallbackInfo& info) {
  AnnoyIndexWrapper* obj = Receiver(info);
  int index = numberOr(info[0], 1);
  std::vector<float> vec = obj->newVector();
  if (obj->getFloatArrayParam(info, 1, vec)) {
    obj->annoyIndex->add_item(index, vec.data());
    // The node array grows geometrically: this reports only on reallocation.
    obj->syncExternalMemory(info.Env());
  }
  return info.Env().Undefined();
}

Napi::Value AnnoyIndexWrapper::Build(const Napi::CallbackInfo& info) {
  AnnoyIndexWrapper* obj = Receiver(info);
  int numberOfTrees = numberOr(info[0], 1);
  obj->annoyIndex->build(numberOfTrees);
  obj->syncExternalMemory(info.Env());
  return info.Env().Undefined();
}

Napi::Value AnnoyIndexWrapper::Save(const Napi::CallbackInfo& info) {
  AnnoyIndexWrapper* obj = Receiver(info);
  bool result = false;
  if (!info[0].IsUndefined()) {
    std::string path = info[0].ToString().Utf8Value();
    result = obj->annoyIndex->save(path.c_str());
  }
  // save() unloads the heap nodes and maps the saved file instead.
  obj->syncExternalMemory(info.Env());
  return Napi::Boolean::New(info.Env(), result);
}

Napi::Value AnnoyIndexWrapper::Load(const Napi::CallbackInfo& info) {
  AnnoyIndexWrapper* obj = Receiver(info);
  bool result = false;
  if (!info[0].IsUndefined()) {
    std::string path = info[0].ToString().Utf8Value();
    result = obj->annoyIndex->load(path.c_str());
  }
  obj->syncExternalMemory(info.Env());
  return Napi::Boolean::New(info.Env(), result);
}

Napi::Value AnnoyIndexWrapper::Unload(const Napi::CallbackInfo& info) {
  AnnoyIndexWrapper* obj = Receiver(info);
  obj->annoyIndex->unload();
  obj->syncExternalMemory(info.Env());
  return info.Env().Undefined();
}

Napi::Value AnnoyIndexWrapper::GetItem(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  AnnoyIndexWrapper* obj = Receiver(info);
  int index = numberOr(info[0], 1);

  std::vector<float> vec = obj->newVector();
  obj->annoyIndex->get_item(index, vec.data());

  int length = obj->annoyDimensions > 0 ? obj->annoyDimensions : 0;
  Napi::Array results = Napi::Array::New(env, length);
  for (int i = 0; i < length; ++i) {
    results.Set(static_cast<uint32_t>(i), Napi::Number::New(env, vec[i]));
  }
  return results;
}

Napi::Value AnnoyIndexWrapper::GetDistance(const Napi::CallbackInfo& info) {
  AnnoyIndexWrapper* obj = Receiver(info);
  int indexA = numberOr(info[0], 0);
  int indexB = numberOr(info[1], 0);
  return Napi::Number::New(info.Env(), obj->annoyIndex->get_distance(indexA, indexB));
}

Napi::Value AnnoyIndexWrapper::GetNNSByVector(const Napi::CallbackInfo& info) {
  AnnoyIndexWrapper* obj = Receiver(info);

  // Same evaluation order as 4.0.1: n, search_k, include_distances, vector.
  int numberOfNeighbors, searchK;
  bool includeDistances;
  getSupplementaryGetNNsParams(info, numberOfNeighbors, searchK, includeDistances);

  std::vector<float> vec = obj->newVector();
  if (!obj->getFloatArrayParam(info, 0, vec)) {
    return info.Env().Undefined();
  }

  std::vector<int> nnIndexes;
  std::vector<float> distances;
  obj->annoyIndex->get_nns_by_vector(vec.data(), numberOfNeighbors, searchK, &nnIndexes,
                                     includeDistances ? &distances : nullptr);
  return nnResult(info.Env(), numberOfNeighbors, includeDistances, nnIndexes, distances);
}

Napi::Value AnnoyIndexWrapper::GetNNSByItem(const Napi::CallbackInfo& info) {
  AnnoyIndexWrapper* obj = Receiver(info);
  if (info[0].IsUndefined()) {
    return info.Env().Undefined();
  }

  int index = info[0].ToNumber().DoubleValue();
  int numberOfNeighbors, searchK;
  bool includeDistances;
  getSupplementaryGetNNsParams(info, numberOfNeighbors, searchK, includeDistances);

  std::vector<int> nnIndexes;
  std::vector<float> distances;
  obj->annoyIndex->get_nns_by_item(index, numberOfNeighbors, searchK, &nnIndexes,
                                   includeDistances ? &distances : nullptr);
  return nnResult(info.Env(), numberOfNeighbors, includeDistances, nnIndexes, distances);
}

Napi::Value AnnoyIndexWrapper::GetNItems(const Napi::CallbackInfo& info) {
  AnnoyIndexWrapper* obj = Receiver(info);
  return Napi::Number::New(info.Env(), obj->annoyIndex->get_n_items());
}

void AnnoyIndexWrapper::getSupplementaryGetNNsParams(const Napi::CallbackInfo& info,
                                                     int& numberOfNeighbors, int& searchK,
                                                     bool& includeDistances) {
  numberOfNeighbors = numberOr(info[1], 1);
  searchK = numberOr(info[2], -1);
  includeDistances = info[3].IsUndefined() ? false : info[3].ToBoolean().Value();
}

// 4.0.1 sized the result arrays with the requested neighbour count n
// (v8::Array::New gives length 0 for n <= 0) and read past the end of
// nnIndexes/distances when Annoy returned fewer results (fewer items than n,
// or an index without trees). The length is now min(max(n, 0), results):
// identical whenever 4.0.1 was defined, real results only otherwise.
// (Annoy itself returns every item for a negative n, hence the clamp.)
Napi::Value AnnoyIndexWrapper::nnResult(Napi::Env env, int numberOfNeighbors,
                                        bool includeDistances,
                                        const std::vector<int>& nnIndexes,
                                        const std::vector<float>& distances) {
  size_t length = numberOfNeighbors > 0 ? static_cast<size_t>(numberOfNeighbors) : 0;
  if (nnIndexes.size() < length) length = nnIndexes.size();
  if (includeDistances && distances.size() < length) length = distances.size();

  Napi::Array jsNNIndexes = Napi::Array::New(env, length);
  for (size_t i = 0; i < length; ++i) {
    jsNNIndexes.Set(static_cast<uint32_t>(i), Napi::Number::New(env, nnIndexes[i]));
  }
  if (!includeDistances) {
    return jsNNIndexes;
  }

  Napi::Array jsDistances = Napi::Array::New(env, length);
  for (size_t i = 0; i < length; ++i) {
    jsDistances.Set(static_cast<uint32_t>(i), Napi::Number::New(env, distances[i]));
  }
  Napi::Object result = Napi::Object::New(env);
  result.Set(propertyKey(env, "neighbors"), jsNNIndexes);
  result.Set(propertyKey(env, "distances"), jsDistances);
  return result;
}

// Returns true if info[paramIndex] is a JS Array or a numeric typed array,
// after copying its elements into vec. Array elements are each coerced with
// ToNumber; like 4.0.1, every element is coerced, including those beyond the
// index dimensions, which are not stored (4.0.1 wrote them past the end of a
// stack buffer). Typed arrays are read directly (new in 5.0.0).
bool AnnoyIndexWrapper::getFloatArrayParam(const Napi::CallbackInfo& info, size_t paramIndex,
                                           std::vector<float>& vec) const {
  Napi::Value value = info[paramIndex];
  const uint32_t dimensions = annoyDimensions > 0 ? static_cast<uint32_t>(annoyDimensions) : 0;

  // 5.0.0: numeric typed arrays are read straight from their backing store,
  // without one N-API call per component (4.0.1 ignored them). Same rules as
  // for an Array: missing components stay 0, extra components are ignored.
  if (value.IsTypedArray()) {
    Napi::TypedArray typed = value.As<Napi::TypedArray>();
    size_t length = typed.ElementLength();
    size_t count = length < dimensions ? length : dimensions;
    switch (typed.TypedArrayType()) {
      case napi_float32_array: {
        const float* data = value.As<Napi::Float32Array>().Data();
        std::memcpy(vec.data(), data, count * sizeof(float));
        return true;
      }
      case napi_float64_array:
        copyTypedArray(value.As<Napi::Float64Array>().Data(), count, vec);
        return true;
      case napi_int8_array:
        copyTypedArray(value.As<Napi::Int8Array>().Data(), count, vec);
        return true;
      case napi_uint8_array:
      case napi_uint8_clamped_array:
        copyTypedArray(static_cast<const uint8_t*>(typed.ArrayBuffer().Data()) + typed.ByteOffset(), count, vec);
        return true;
      case napi_int16_array:
        copyTypedArray(value.As<Napi::Int16Array>().Data(), count, vec);
        return true;
      case napi_uint16_array:
        copyTypedArray(value.As<Napi::Uint16Array>().Data(), count, vec);
        return true;
      case napi_int32_array:
        copyTypedArray(value.As<Napi::Int32Array>().Data(), count, vec);
        return true;
      case napi_uint32_array:
        copyTypedArray(value.As<Napi::Uint32Array>().Data(), count, vec);
        return true;
      default:
        // BigInt64Array / BigUint64Array (and any future type): not numbers,
        // treated as before, like any non-Array value.
        return false;
    }
  }

  if (!value.IsArray()) {
    return false;
  }
  Napi::Array jsArray = value.As<Napi::Array>();
  // Length is re-read on every iteration, as in 4.0.1.
  for (uint32_t i = 0; i < jsArray.Length(); i++) {
    float component = (float)jsArray.Get(i).ToNumber().DoubleValue();
    if (i < dimensions) {
      vec[i] = component;
    }
  }
  return true;
}
