#!/usr/bin/env bash
# Joins the ERP database and the source gateway to the Zetaris compose network so Zetaris resolves
# payee-erp-db:5432 and source-gateway:8790 by name (06 section 9.3, K2 path N1). Idempotent: "already exists" is ignored.
# The compose file never declares this network, so the sample stack starts on a clean clone without Zetaris.
set -uo pipefail

NETWORK="${ZETARIS_DOCKER_NETWORK:-zetaris_default}"

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "network $NETWORK not found; start Zetaris first or set ZETARIS_DOCKER_NETWORK" >&2
  exit 1
fi

attach() {
  local container="$1" alias="$2" out
  if ! docker inspect "$container" >/dev/null 2>&1; then
    echo "skip $container (not running)"
    return 0
  fi
  if out=$(docker network connect --alias "$alias" "$NETWORK" "$container" 2>&1); then
    echo "attached $container to $NETWORK as $alias"
  elif grep -qi "already exists" <<<"$out"; then
    echo "$container already on $NETWORK"
  else
    echo "$out" >&2
    return 1
  fi
}

attach payee-erp-db payee-erp-db
attach source-gateway source-gateway
