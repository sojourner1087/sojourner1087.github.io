#!/bin/sh
set -eu

# Publish only the files used by this site.
cd "$(dirname "$0")/.."
rm -rf firebase-public
mkdir -p firebase-public
cp index.html firebase-public/index.html
mkdir -p firebase-public/assets
cp assets/bramble-realistic.png firebase-public/assets/bramble-realistic.png
