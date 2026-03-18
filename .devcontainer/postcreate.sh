#!/usr/bin/env sh

set -eu

# Install the current version of Radius
wget -q "https://raw.githubusercontent.com/radius-project/radius/main/deploy/install.sh" -O - | /bin/bash

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 # Disable corepack download prompt (silent option)
# Install yarn
sudo corepack enable
corepack prepare yarn@4.13.0 --activate
yarn install
yarn exec playwright install chrome
