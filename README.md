# @sharedmemory/cli

Command-line interface for [SharedMemory](https://sharedmemory.ai) — AI that follows your project rules automatically.

## Installation

```bash
npm install -g @sharedmemory/cli
```

Requires Node.js 18+.

## Setup

```bash
sm login          # authenticate via browser
sm init           # guided setup wizard
```

Or manual:

```bash
sm config --api-key sm_live_...
sm config --volume your-volume-id
```

## Commands

### `sm "question"` (default)

Just type your question — SharedMemory answers using your stored memories.

```bash
sm "What technologies does John use?"
```

### `sm remember <content>`

Store a memory.

```bash
sm remember "John Smith is the CTO of Acme Corp"
```

Options: `-v <volume>`, `-t <type>` (factual / episodic / procedural), `-a <agent>`

### `sm query <query>`

Query memories (raw vector + knowledge graph search).

```bash
sm query "React"
```

Options: `-v <volume>`, `-n <limit>`

### `sm ask <question>`

Ask a question explicitly (same as the default command).

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
