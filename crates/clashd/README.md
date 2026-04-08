# clashd - Policy Sidecar for OpenClaw

HTTP policy enforcement service that intercepts tool calls and evaluates them against security rules before execution.

## Quick Start

```bash
# Build
cargo build -p clashd --release

# Run
./target/release/clashd

# Or with custom config
CLASHD_PORT=9001 CLASHD_POLICY=/etc/clash/policy.star ./target/release/clashd
```

## API

### POST /evaluate

Evaluate a tool call before execution.

**Request:**
```json
{
  "tool": "gateway",
  "args": {
    "action": "config.patch",
    "patch": { ... }
  },
  "context": {
    "identity": "main",
    "agent": "librarian"
  }
}
```

**Response:**
```json
{
  "verdict": "review",
  "reason": "Critical operation 'gateway config.' requires custodian approval"
}
```

Verdicts:
- `allow` - Execute the tool call
- `deny` - Block the tool call (returns error to LLM)
- `review` - Requires human approval before execution

### GET /health

Health check endpoint. Returns `OK`.

### GET /

Version and status information.

## Hardcoded Policies (v1)

Currently implemented as hardcoded rules:

**ALWAYS_REQUIRE_REVIEW:**
- `gateway` + `config.*` - Any OpenClaw config change
- `gateway` + `restart` - Gateway restart
- `cron` + `remove` - Removing cron jobs
- `write` + `.openclaw` - Writing to OpenClaw config files
- `edit` + `.openclaw` - Editing OpenClaw config files

**ALWAYS_DENY:**
- Destructive shell commands: `rm -rf`, `mkfs`, `wipefs`, `dd if=/dev/`

## Future: Starlark Policy Engine

The plan is to integrate the full [clash](https://github.com/zeroclaw-labs/zeroclaw/tree/main/crates/clash) Starlark policy engine for customizable rules:

```python
# ~/.clash/policy.star
def evaluate(tool, args, context):
    # Block config changes without custodian
    if tool == "gateway" and args.get("action", "").startswith("config."):
        return "review:custodian_approval_required"
    
    # Block destructive commands
    if tool == "shell":
        cmd = args.get("command", "")
        if "rm -rf" in cmd or "mkfs" in cmd:
            return "deny:destructive_command_blocked"
    
    return "allow"
```

## OpenClaw Integration

To enable in OpenClaw, configure the gateway to call clashd before executing tools:

```json
{
  "tools": {
    "policy": {
      "enabled": true,
      "endpoint": "http://localhost:9001/evaluate"
    }
  }
}
```

## Docker

```bash
# Build image
docker build -t clashd:latest -f crates/clashd/Dockerfile .

# Run
docker run -p 9001:9001 clashd:latest
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLASHD_PORT` | `9001` | HTTP server port |
| `CLASHD_POLICY` | `~/.clash/policy.star` | Path to Starlark policy file (future) |
