# @sharedmemory/cli

Command-line interface for [SharedMemory](https://sharedmemory.ai) — manage AI agent memory from the terminal.

## Installation

```bash
npm install -g @sharedmemory/cli
```

Requires Node.js 18+.

## Setup

```bash
sm config --api-key sm_live_...
sm config --volume your-volume-id
```

## Commands

### `sm add <content>`

Store a memory.

```bash
sm add "John Smith is the CTO of Acme Corp"
```

Options: `-v <volume>`, `-t <type>` (factual / episodic / procedural), `-a <agent>`

### `sm search <query>`

Search entities in the knowledge graph.

```bash
sm search "React"
```

Options: `-v <volume>`, `-n <limit>`

### `sm ask <question>`

Ask a question — the LLM answers using your stored memories (full RAG pipeline).

```bash
sm ask "What technologies does John use?"
```

Options: `-v <volume>`, `--learn` (auto-save insights from the conversation)

### `sm profile`

View the auto-generated profile for the current volume.

### `sm volumes`

List available memory volumes.

### `sm status`

Check API connectivity.

```
$ sm status
Connected to SharedMemory
  URL:     https://api.sharedmemory.ai
  Version: 2.0
```

### `sm agents list`

List agents in an organization.

```bash
sm agents list --org <org-id>
```

### `sm agents create`

Create a new agent and get an API key.

```bash
sm agents create --org <org-id> --project <project-id> --name "my-agent"
```

### `sm agents delete`

Deactivate an agent and revoke its API key.

```bash
sm agents delete <agent-id> --org <org-id>
```

### `sm agents rotate-key`

Rotate an agent's API key.

```bash
sm agents rotate-key <agent-id> --org <org-id>
```

## Documentation

https://docs.sharedmemory.ai/sdks/cli

## License

MIT
