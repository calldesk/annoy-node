FROM public.ecr.aws/lambda/nodejs:22

ENV LAMBDA_ENV=true

ENTRYPOINT []

WORKDIR /build

# Install build tools (Python required by node-gyp)
RUN dnf install -y gcc gcc-c++ make python3 && \
  dnf clean all

# Copy files
COPY package*.json ./
COPY . .

# Install dependencies without running install script (no prebuilds yet)
RUN npm ci --ignore-scripts

# Compile using local Node 22 headers, then place in prebuilds directory
RUN npx node-gyp rebuild && \
    mkdir -p prebuilds/linux-x64 && \
    cp build/Release/addon.node prebuilds/linux-x64/@calldesk+annoy-node.node

CMD ["echo", "Linux prebuild created"]
