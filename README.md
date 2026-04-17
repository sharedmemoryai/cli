# @sharedmemory/cli

Command-line interface for [SharedMemory](https://sharedmemory.ai) — manage AI agent memory from the terminal.

## Installation

```bash
npm install -g @sharedmemory/cli
```

Requires Node.js 18+.

## Setup

```bash
smem config --api-key sm_live_...
smem config --volume your-volume-id
```

## Commands

### `smem add <content>`

Store a memory.

```bash
smem add "John Smith is the CTO of Acme Corp"
```

Options: `-v <volume>`, `-t <type>` (factual / episodic / procedural), `-a <agent>`

### `smem search <query>`

Search entities in the knowledge graph.

```bash
smem search "React"
```

### `smem ask <question>`

Ask a question answered from stored memories.

```bash
smem ask "What technologies does John use?"
```

Options: `-v <volume>`, `--learn` (auto-save insights from the conversation)

### `smem profile`

View the auto-generated profile for the current volume.

### `smem volumes`

List available memory volumes.

### `smem status`

Check API connectivity.

```
$ smem status
Connected to SharedMemory
  URL:     https://api.sharedmemory.ai
  Version: 2.0
```

### `smem agents list`

List agents in an organization.

```bash
smem agents list --org <org-id>
```

### `smem agents create`

Create a new agent and get an API key.

```bash
smem agents create --org <org-id> --project <project-id> --name "my-agent"
```

### `smem agents delete`

Deactivate an agent and revoke its API key.

```bash
smem agents delete <agent-id>
```

### `smem agents rotate-key`

Rotate an agent's API key.

```bash
smem agents rotate-key <agent-id>
```

## Documentation

https://docs.sharedmemory.ai/sdks/cli

## License

MIT
