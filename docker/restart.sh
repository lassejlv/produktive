#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"
MCP_ENV_FILE="$ROOT_DIR/.env.mcp"
BOT_ENV_FILE="$ROOT_DIR/.env.bot"
SETUP_ENV_FILE="$ROOT_DIR/.env.compose"
INCLUDE_POSTGRES=false

if [ -f "$SETUP_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$SETUP_ENV_FILE"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy .env.example to .env and fill in the required values." >&2
  exit 1
fi
if [ ! -f "$MCP_ENV_FILE" ]; then
  echo "Missing $MCP_ENV_FILE. Copy .env.mcp.example to .env.mcp and fill in the required values." >&2
  exit 1
fi
if [ ! -f "$BOT_ENV_FILE" ]; then
  echo "Missing $BOT_ENV_FILE. Copy .env.bot.example to .env.bot and fill in the required values." >&2
  exit 1
fi

cd "$ROOT_DIR"
if [ "${COMPOSE_INCLUDE_POSTGRES:-$INCLUDE_POSTGRES}" = "true" ]; then
  ${DOCKER_CMD:-docker} compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker/compose.yaml" -f "$ROOT_DIR/docker/compose.postgres.yaml" up -d --build --force-recreate "$@"
else
  ${DOCKER_CMD:-docker} compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker/compose.yaml" up -d --build --force-recreate "$@"
fi
