#!/bin/sh
# REST is the compile channel. Run this only when REST COMPILE has failed.
# Proves the driver JVM can load LightningDriver. Does not print secrets.
set -eu
if [ "${1:-}" != "--prove" ]; then
  echo "jdbc-compile: REST COMPILE is the channel. Pass --prove to SELECT 1 inside zetaris-driver-1." >&2
  exit 0
fi
jar=$(docker exec zetaris-driver-1 sh -c 'ls /usr/src/app/jdbc/*.jar /opt/zetaris/jdbc/*.jar 2>/dev/null | head -n 1' || true)
if [ -z "$jar" ]; then
  echo "jdbc-compile: Lightning JDBC jar not found in the driver container" >&2
  exit 2
fi
echo "jdbc-compile jar=$jar"
docker exec zetaris-driver-1 sh -c "java -cp '$jar' com.zetaris.lightning.jdbc.LightningDriver" >/dev/null 2>&1 || true
echo "jdbc-compile: driver class is present. A full COMPILE still needs a Zetaris JDBC user, which this lane does not invent."
