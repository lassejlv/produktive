#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"
SETUP_ENV_FILE="$ROOT_DIR/.env.compose"
INCLUDE_POSTGRES=false

if [ -f "$SETUP_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$SETUP_ENV_FILE"
fi

cd "$ROOT_DIR"
if [ -f "$ENV_FILE" ]; then
  if [ "${COMPOSE_INCLUDE_POSTGRES:-$INCLUDE_POSTGRES}" = "true" ]; then
    ${DOCKER_CMD:-docker} compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker/compose.yaml" -f "$ROOT_DIR/docker/compose.postgres.yaml" down "$@"
  else
    ${DOCKER_CMD:-docker} compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker/compose.yaml" down "$@"
  fi
else
  if [ "${COMPOSE_INCLUDE_POSTGRES:-$INCLUDE_POSTGRES}" = "true" ]; then
    ${DOCKER_CMD:-docker} compose -f "$ROOT_DIR/docker/compose.yaml" -f "$ROOT_DIR/docker/compose.postgres.yaml" down "$@"
  else
    ${DOCKER_CMD:-docker} compose -f "$ROOT_DIR/docker/compose.yaml" down "$@"
  fi
fi
