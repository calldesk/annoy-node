{
  "targets": [
    {
      "target_name": "addon",
      "sources": [ "addon.cc", "annoyindexwrapper.cc" ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")"
      ],
      # Node-API 10, the latest stable version: this package only serves bot-api,
      # which follows the AWS Lambda Node.js runtime (Node >= 22.14 / 23.6).
      "defines": [ "NAPI_VERSION=10", "NAPI_CPP_EXCEPTIONS", "NODE_ADDON_API_DISABLE_DEPRECATED" ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      # No fused multiply-add: GCC contracts a*b+c into FMA on arm64 but not on
      # x86-64 (no FMA in the baseline ISA), which changes float rounding, so the
      # same index gave different distances and trees on each architecture.
      "cflags_cc": [ "-ffp-contract=off" ],
      "xcode_settings": {
        "OTHER_CPLUSPLUSFLAGS": [ "-ffp-contract=off" ],
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "11.0"
      },
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 }
      }
    }
  ]
}
