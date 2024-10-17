#!/usr/bin/env sh
set -eu

# Install the current version of Radius
wget -q "https://raw.githubusercontent.com/radius-project/radius/main/deploy/install.sh" -O - | /bin/bash

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 # Disable corepack download prompt (silent option)
sudo corepack enable
yarn install