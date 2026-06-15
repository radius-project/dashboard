#!/usr/bin/env sh

set -eu

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 # Disable corepack download prompt (silent option)
yarn install
yarn exec playwright install chrome
