#!/usr/bin/env node

import { Command } from "commander";
import Conf from "conf";
import chalk from "chalk";
import ora from "ora";

const config = new Conf({ projectName: "sharedmemory" });
const program = new Command();

// ─── Helpers ────────────────────────────────────────────

function getBaseUrl(): string {
  return (config.get("baseUrl") as string) || "https://api.sharedmemory.ai";
}

function getApiKey(): string {
  const key = config.get("apiKey") as string;
  if (!key) {
    console.error(chalk.red("No API key configured. Run: smem config --api-key <key>"));
    process.exit(1);
  }
  return key;
}

function getVolumeId(): string {
  return (config.get("volumeId") as string) || "default";
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getApiKey()}`,
    ...(opts.headers as Record<string, string> || {}),
  };

  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Config ─────────────────────────────────────────────

program
  .name("smem")
  .description("SharedMemory CLI — manage AI agent memory from your terminal")
  .version("2.0.0");

program
  .command("config")
  .description("Configure the CLI")
  .option("--api-key <key>", "Set your SharedMemory API key")
  .option("--base-url <url>", "Set the API base URL (default: http://localhost:5000)")
  .option("--volume <id>", "Set the default volume ID")
  .option("--show", "Show current config")
  .action((opts) => {
    if (opts.apiKey) {
      config.set("apiKey", opts.apiKey);
      console.log(chalk.green("✓ API key saved"));
    }
    if (opts.baseUrl) {
      config.set("baseUrl", opts.baseUrl);
      console.log(chalk.green(`✓ Base URL set to ${opts.baseUrl}`));
    }
    if (opts.volume) {
      config.set("volumeId", opts.volume);
      console.log(chalk.green(`✓ Default volume set to ${opts.volume}`));
    }
    if (opts.show || (!opts.apiKey && !opts.baseUrl && !opts.volume)) {
      console.log(chalk.bold("\nCurrent config:"));
      console.log(`  Base URL:  ${getBaseUrl()}`);
      console.log(`  API Key:   ${config.get("apiKey") ? "****" + String(config.get("apiKey")).slice(-4) : chalk.yellow("not set (sm_proj_rw_… or sm_agent_…)")}`);
      console.log(`  Volume:    ${getVolumeId()}`);
      console.log();
    }
  });

// ─── Add Memory ─────────────────────────────────────────

program
  .command("add <content...>")
  .description("Add a memory to the current volume")
  .option("-v, --volume <id>", "Volume ID")
  .option("-t, --type <type>", "Memory type (factual, episodic, procedural)", "factual")
  .option("-a, --agent <name>", "Agent name", "cli")
  .action(async (contentParts: string[], opts) => {
    const content = contentParts.join(" ");
    const spinner = ora("Adding memory...").start();

    try {
      const result = await apiFetch("/agent/memory/write", {
        method: "POST",
        body: JSON.stringify({
          content,
          volume_id: opts.volume || getVolumeId(),
          agent: opts.agent,
          memory_type: opts.type,
          source: "cli",
        }),
      });

      spinner.stop();

      const statusColor = result.status === "approved" ? chalk.green : 
                          result.status === "rejected" ? chalk.red : chalk.yellow;
      
      console.log(`${statusColor(result.status.toUpperCase())} ${chalk.dim(`(${(result.confidence * 100).toFixed(0)}% confidence)`)}`);
      console.log(chalk.dim(`  Reason: ${result.reason}`));
      console.log(chalk.dim(`  Memory ID: ${result.memory_id}`));
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ─── Search ─────────────────────────────────────────────

program
  .command("search <query...>")
  .description("Search memories (hybrid: vector + knowledge graph)")
  .option("-v, --volume <id>", "Volume ID")
  .option("-m, --mode <mode>", "Search mode: hybrid, vector, graph", "hybrid")
  .option("-n, --limit <n>", "Max results", "10")
  .action(async (queryParts: string[], opts) => {
    const q = queryParts.join(" ");
    const spinner = ora("Searching...").start();

    try {
      const result = await apiFetch("/agent/entities/search", {
        method: "POST",
        body: JSON.stringify({
          query: q,
          volume_id: opts.volume || getVolumeId(),
          limit: parseInt(opts.limit),
        }),
      });

      spinner.stop();

      if (!result.length) {
        console.log(chalk.dim("\nNo entities found.\n"));
        return;
      }

      console.log(chalk.bold(`\n${result.length} entities found\n`));

      for (const [i, e] of result.entries()) {
        console.log(`  ${chalk.dim(`${i + 1}.`)} ${chalk.cyan(e.name)} ${chalk.dim(`[${e.type}]`)} ${chalk.dim(`(${e.factCount} facts)`)}`);
        if (e.summary) console.log(`     ${chalk.dim(e.summary)}`);
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ─── Query (ask a question, get LLM answer) ────────────

program
  .command("ask <question...>")
  .description("Ask a question — LLM answers using your memory")
  .option("-v, --volume <id>", "Volume ID")
  .option("--learn", "Auto-learn from the conversation")
  .action(async (questionParts: string[], opts) => {
    const query = questionParts.join(" ");
    const spinner = ora("Thinking...").start();

    try {
      const result = await apiFetch("/agent/memory/query", {
        method: "POST",
        body: JSON.stringify({
          query,
          volume_id: opts.volume || getVolumeId(),
          auto_learn: opts.learn || false,
        }),
      });

      spinner.stop();
      console.log();

      if (result.memories?.length) {
        console.log(chalk.bold(`${result.memories.length} relevant memories:\n`));
        for (const [i, m] of result.memories.entries()) {
          console.log(`  ${chalk.dim(`${i + 1}.`)} ${chalk.dim(`(${(m.score * 100).toFixed(0)}%)`)} ${m.content}`);
          console.log(`     ${chalk.dim(`by ${m.agent || "unknown"} · ${m.created_at?.split("T")[0] || ""}`)}`);
        }
      } else {
        console.log(chalk.dim("No relevant memories found."));
      }

      if (result.graph_facts?.length) {
        console.log(chalk.bold.blue("\nGraph facts:"));
        for (const f of result.graph_facts) {
          console.log(`  ${chalk.cyan(f.source)} ${chalk.dim("→")} ${chalk.yellow(f.type)} ${chalk.dim("→")} ${chalk.cyan(f.target)}`);
        }
      }

      console.log(chalk.dim(`\nTotal: ${result.total_results} results`));
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ─── Profile ────────────────────────────────────────────

program
  .command("profile")
  .description("View the auto-generated profile for this volume")
  .option("-v, --volume <id>", "Volume ID")
  .option("--refresh", "Force regenerate the profile")
  .action(async (opts) => {
    const spinner = ora("Generating profile...").start();

    try {
      const vol = opts.volume || getVolumeId();
      const result = await apiFetch(`/agent/entity`, {
        method: "POST",
        body: JSON.stringify({ name: vol, volume_id: vol }),
      });

      spinner.stop();

      console.log(chalk.bold(`\nProfile: ${result.user_id}\n`));
      console.log(chalk.dim(result.summary));
      console.log();

      if (result.static_profile.facts.length) {
        console.log(chalk.bold("Stable facts:"));
        for (const f of result.static_profile.facts) {
          console.log(`  • ${f}`);
        }
        console.log();
      }

      if (result.dynamic_profile.activities.length) {
        console.log(chalk.bold("Recent activity:"));
        for (const a of result.dynamic_profile.activities) {
          console.log(`  → ${chalk.cyan(a)}`);
        }
        console.log();
      }
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ─── Volumes ────────────────────────────────────────────

program
  .command("volumes")
  .description("List your memory volumes")
  .action(async () => {
    const spinner = ora("Fetching volumes...").start();

    try {
      const result = await apiFetch("/agent/volumes");
      spinner.stop();

      console.log(chalk.bold("\nMemory Volumes:\n"));
      for (const v of result) {
        const active = v.volume_id === getVolumeId() ? chalk.green(" ← active") : "";
        console.log(`  ${chalk.cyan(v.name)} ${chalk.dim(`(${v.volume_id})`)}${active}`);
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ─── Status ─────────────────────────────────────────────

program
  .command("status")
  .description("Check API connection and memory stats")
  .action(async () => {
    const spinner = ora("Checking...").start();

    try {
      const health = await apiFetch("/health");
      spinner.stop();

      console.log(chalk.green("✓ Connected to SharedMemory"));
      console.log(chalk.dim(`  URL: ${getBaseUrl()}`));
      console.log(chalk.dim(`  Volume: ${getVolumeId()}`));
      if (health.version) console.log(chalk.dim(`  Version: ${health.version}`));
    } catch (err: any) {
      spinner.fail(`Cannot connect to ${getBaseUrl()}: ${err.message}`);
    }
  });

// ─── Agents ─────────────────────────────────────────────

const agentsCmd = program
  .command("agents")
  .description("Manage agent profiles");

agentsCmd
  .command("list")
  .description("List agents for an organization")
  .requiredOption("--org <id>", "Organization ID")
  .option("--project <id>", "Filter by project ID")
  .action(async (opts) => {
    const spinner = ora("Fetching agents...").start();

    try {
      const qs = opts.project ? `?project_id=${opts.project}` : "";
      const result = await apiFetch(`/agents${qs}`, {
        headers: { "x-org-id": opts.org } as any,
      });
      spinner.stop();

      if (!result.length) {
        console.log(chalk.dim("\nNo agents found.\n"));
        return;
      }

      console.log(chalk.bold(`\n${result.length} agent(s):\n`));
      for (const a of result) {
        const status = a.is_active ? chalk.green("active") : chalk.red("inactive");
        console.log(`  ${chalk.cyan(a.name)} ${chalk.dim(`(${a.agent_id})`)} ${status}`);
        if (a.description) console.log(`    ${chalk.dim(a.description)}`);
        console.log(`    ${chalk.dim(`key: ${a.key_prefix}…  created: ${a.created_at?.split("T")[0] || ""}`)}`);
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

agentsCmd
  .command("create")
  .description("Create a new agent with an auto-generated API key")
  .requiredOption("--org <id>", "Organization ID")
  .requiredOption("--project <id>", "Project (volume) ID")
  .requiredOption("--name <name>", "Agent name")
  .option("--description <desc>", "Agent description")
  .option("--system-prompt <prompt>", "System prompt for the agent")
  .action(async (opts) => {
    const spinner = ora("Creating agent...").start();

    try {
      const result = await apiFetch("/agents", {
        method: "POST",
        body: JSON.stringify({
          org_id: opts.org,
          project_id: opts.project,
          name: opts.name,
          description: opts.description,
          system_prompt: opts.systemPrompt,
        }),
      });

      spinner.stop();
      console.log(chalk.green("\n✓ Agent created\n"));
      console.log(`  Name:     ${chalk.cyan(result.agent.name)}`);
      console.log(`  Agent ID: ${chalk.dim(result.agent.agent_id)}`);
      console.log(`  API Key:  ${chalk.yellow(result.api_key)}`);
      console.log(chalk.red("\n  ⚠ Save this key now — it won't be shown again.\n"));
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

agentsCmd
  .command("delete <agent_id>")
  .description("Deactivate an agent and revoke its API key")
  .requiredOption("--org <id>", "Organization ID")
  .action(async (agentId, opts) => {
    const spinner = ora("Deactivating agent...").start();

    try {
      await apiFetch(`/agents/${agentId}`, {
        method: "DELETE",
        headers: { "x-org-id": opts.org } as any,
      });
      spinner.stop();
      console.log(chalk.green("\n✓ Agent deactivated and API key revoked.\n"));
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

agentsCmd
  .command("rotate-key <agent_id>")
  .description("Rotate an agent's API key")
  .requiredOption("--org <id>", "Organization ID")
  .action(async (agentId, opts) => {
    const spinner = ora("Rotating key...").start();

    try {
      const result = await apiFetch(`/agents/${agentId}/rotate-key`, {
        method: "POST",
        headers: { "x-org-id": opts.org } as any,
      });
      spinner.stop();
      console.log(chalk.green("\n✓ Key rotated\n"));
      console.log(`  New API Key: ${chalk.yellow(result.api_key)}`);
      console.log(chalk.red("\n  ⚠ Save this key now — it won't be shown again.\n"));
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

program.parse();
