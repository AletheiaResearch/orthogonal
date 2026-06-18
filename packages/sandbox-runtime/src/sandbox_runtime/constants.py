"""Shared constants for sandbox modules."""

CODE_SERVER_PORT = 8080
TTYD_PORT = 7681
TTYD_PROXY_PORT = 7680

# Dotenv file containing `TUNNEL_<port>=<url>` per line, consumed by local
# services via `--env-file` or direct read.
TUNNEL_ENV_FILE_PATH = "/workspace/.tunnels.env"

# Comma-separated tunnel ports the manager will resolve. Read by the entrypoint
# to gate stale-file cleanup and the wait-for-fresh-URLs before start.sh.
EXPECTED_TUNNEL_PORTS_ENV_VAR = "EXPECTED_TUNNEL_PORTS"

# OpenCode provider id under which the Terminus gateway registers every routed
# model. Models are keyed "<provider>/<model>", so OpenCode's
# "<GATEWAY_PROVIDER_ID>/<provider>/<model>" selector yields body.model ==
# "<provider>/<model>" — what Terminus expects. Keep in sync with
# plugins/gateway-plugin.js (GATEWAY_PROVIDER_ID).
GATEWAY_PROVIDER_ID = "gateway"

# Env var the entrypoint sets when it actually deploys gateway-plugin.js and
# re-keys the default model to the gateway provider. It is the single authoritative
# "the gateway is live in this sandbox" signal: the bridge reads it to re-key
# per-prompt model overrides too (CON-75), so the entrypoint's plugin-present +
# GATEWAY_TOKEN check is never re-derived (and never drifts) downstream.
GATEWAY_ACTIVE_ENV = "GATEWAY_ACTIVE"
