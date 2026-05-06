#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"

cd "$ROOT_DIR"
if [ -f "$ENV_FILE" ]; then
  docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker/compose.yaml" down "$@"
else
  docker compose -f "$ROOT_DIR/docker/compose.yaml" down "$@"
fi
