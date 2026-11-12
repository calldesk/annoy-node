# Builds the Linux N-API prebuild inside the AWS Lambda nodejs:22 image
# (Amazon Linux 2023: glibc 2.34, GCC 11), so the binary only needs symbols
# the Lambda runtime provides. One build per architecture:
#
#   docker buildx build --platform linux/amd64 --target prebuilds --output type=local,dest=prebuilds .
#   docker buildx build --platform linux/arm64 --target prebuilds --output type=local,dest=prebuilds .
#
# (npm run prebuild:linux runs both, then scripts/check-prebuild-symbols.sh.)
# The result is prebuilds/linux-<arch>/@calldesk+annoy-node.napi.node, which
# node-gyp-build loads on any Node version with N-API >= 8.

FROM public.ecr.aws/lambda/nodejs:22 AS build

ENTRYPOINT []
WORKDIR /build

# node-gyp needs Python, make and a C++ compiler; prebuildify --strip needs binutils.
RUN dnf install -y gcc gcc-c++ make python3 binutils && \
  dnf clean all

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY binding.gyp addon.cc annoyindexwrapper.cc annoyindexwrapper.h annoylib.h kissrandom.h index.js ./
RUN npx prebuildify --napi --strip && \
  rm -rf build

# Smoke-test the prebuild (loaded through index.js / node-gyp-build, build/
# removed above) in the runtime it targets.
COPY tests ./tests
RUN mkdir -p tests/data
RUN node tests/smalltest.js && \
  node tests/smalltest-manhattan.js && \
  node tests/wrong-input-test.js && \
  node tests/undefined-behaviour-test.js

FROM scratch AS prebuilds
COPY --from=build /build/prebuilds/ /
