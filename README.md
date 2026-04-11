# @sharedmemory/cli

Command-line interface for [SharedMemory](https://sharedmemory.ai) — manage AI agent memory from your terminal.

## Install

```bash
npm install -g @sharedmemory/cli
```

## Setup

```bash
smem config --api-key sm_live_...
smem config --base-url https://api.sharedmemory.ai
smem config --volume your-volume-id
```

## Commands

### `smem add <content>`

Add a memory to the current volume.

```bash
smem add "John Smith is the CTO of Acme Corp"
# APPROVED (92% confidence)
#   Reason: New factual information
#   Memory ID: a1b2c3d4-...
```

Options: `-v <volume>`, `-t <type>` (factual/episodic/procedural), `-a <agent>`

### `smem search <query>`

Search entities in the knowledge graph.

```bash
smem search "React"
# 3 entities found
#   1. React [technology] (12 facts)
```

### `smem ask <question>`

Ask a question — the LLM answers using your stored memories.

```bash
smem ask "What technologies does John use?"
```

Options: `-v <volume>`, `--learn` (auto-learn from conversation)

### `smem profile`

View the auto-generated profile for the current volume.

### `smem volumes`

List your memory volumes.

### `smem status`

Check API connection.

```bash
smem status
# ✓ Connected to SharedMemory
#   URL: https://api.sharedmemory.ai
#   Version: 2.0
```

## Docs

Full documentation: [docs.sharedmemory.ai/sdks/cli](https://docs.sharedmemory.ai/sdks/cli)

## License

MIT
