#!/usr/bin/env node

import { Command } from "commander";
import Conf from "conf";
import chalk from "chalk";
import ora from "ora";

const config = new Conf({ projectName: "sharedmemory" });
const program = new Command();

// ─── Helpers ────────────────────────────────────────────

function getBaseUrl(): string {
  return process.env.SM_BASE_URL || (config.get("baseUrl") as string) || "https://api.sharedmemory.ai";
}

function getApiKey(): string {
  const key = process.env.SM_API_KEY || (config.get("apiKey") as string);
  if (!key) {
    console.error(chalk.red("No API key configured. Run: smem config --api-key <key>  or set SM_API_KEY"));
    process.exit(1);
  }
  return key;
}

function getVolumeId(): string {
  const vol = process.env.SM_VOLUME_ID || (config.get("volumeId") as string);
  if (!vol) {
    console.error(chalk.red("No volume configured. Run: smem config --volume <uuid>  or set SM_VOLUME_ID"));
    process.exit(1);
  }
  return vol;
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
  .version("2.0.1");

program
  .command("config")
  .description("Configure the CLI")
  .option("--api-key <key>", "Set your SharedMemory API key")
  .option("--base-url <url>", "Set the API base URL (default: https://api.sharedmemory.ai)")
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
  .option("-d, --date <date>", "Event date (ISO format, e.g. 2026-04-22)")
  .option("-a, --agent <name>", "Agent name", "cli")
  .action(async (contentParts: string[], opts) => {
    const content = contentParts.join(" ");
    const spinner = ora("Adding memory...").start();

    try {
      const body: any = {
        content,
        volume_id: opts.volume || getVolumeId(),
        agent: opts.agent,
        memory_type: opts.type,
        source: "cli",
      };
      if (opts.date) body.event_date = opts.date;
      const result = await apiFetch("/agent/memory/write", {
        method: "POST",
        body: JSON.stringify(body),
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
  .option("-n, --limit <n>", "Max results", "10")
  .option("--from <date>", "Filter events from this date (ISO, e.g. 2026-04-01)")
  .option("--to <date>", "Filter events until this date (ISO, e.g. 2026-04-30)")
  .action(async (queryParts: string[], opts) => {
    const q = queryParts.join(" ");
    const spinner = ora("Searching...").start();

    try {
      const body: any = {
        query: q,
        volume_id: opts.volume || getVolumeId(),
        limit: parseInt(opts.limit),
      };
      if (opts.from) body.date_from = opts.from;
      if (opts.to) body.date_to = opts.to;
      const result = await apiFetch("/agent/memory/query", {
        method: "POST",
        body: JSON.stringify(body),
      });

      spinner.stop();

      if (!result.memories?.length && !result.graph_facts?.length) {
        console.log(chalk.dim("\nNo results found.\n"));
        return;
      }

      if (result.memories?.length) {
        console.log(chalk.bold(`\n${result.memories.length} memories found\n`));
        for (const [i, m] of result.memories.entries()) {
          const pct = Math.round((m.score || 0) * 100);
          const agent = m.agent ? `by ${m.agent}` : "";
          const date = m.created_at ? m.created_at.slice(0, 10) : "";
          console.log(`  ${chalk.dim(`${i + 1}.`)} ${chalk.dim(`(${pct}%)`)} ${m.content}`);
          if (agent || date) console.log(`     ${chalk.dim(`${agent} · ${date}`)}`);
        }
      }

      if (result.graph_facts?.length) {
        console.log(chalk.bold(`\n${result.graph_facts.length} graph facts\n`));
        for (const f of result.graph_facts) {
          console.log(`  ${chalk.cyan(f.source)} ${chalk.dim("→")} ${chalk.yellow(f.type)} ${chalk.dim("→")} ${chalk.cyan(f.target)}`);
          if (f.description) console.log(`     ${chalk.dim(f.description)}`);
        }
      }

      console.log(chalk.dim(`\nTotal: ${result.total_results} results`));
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
  .description("View a comprehensive profile for this volume (or a specific user)")
  .option("-v, --volume <id>", "Volume ID")
  .option("-u, --user <id>", "User ID to scope profile (optional)")
  .option("--refresh", "Force regenerate (bypass 5-min cache)")
  .action(async (opts) => {
    const spinner = ora("Building profile...").start();

    try {
      const vol = opts.volume || getVolumeId();
      const body: any = { volume_id: vol };
      if (opts.user) body.user_id = opts.user;
      if (opts.refresh) body.refresh = true;

      const result = await apiFetch(`/agent/memory/profile`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      spinner.stop();

      const title = result.user_id ? `Profile: ${result.user_id}` : "Volume Profile";
      console.log(chalk.bold(`\n${title}\n`));
      if (result.summary) console.log(chalk.dim(result.summary) + "\n");

      if (result.identity?.length) {
        console.log(chalk.bold("Identity:"));
        for (const f of result.identity) console.log(`  • ${f}`);
        console.log();
      }

      if (result.preferences?.length) {
        console.log(chalk.bold("Preferences:"));
        for (const p of result.preferences) console.log(`  • ${chalk.cyan(p)}`);
        console.log();
      }

      if (result.expertise?.length) {
        console.log(chalk.bold("Expertise:"));
        for (const e of result.expertise) console.log(`  • ${chalk.yellow(e)}`);
        console.log();
      }

      if (result.projects?.length) {
        console.log(chalk.bold("Projects:"));
        for (const p of result.projects) console.log(`  • ${p}`);
        console.log();
      }

      if (result.recent_activity?.length) {
        console.log(chalk.bold("Recent Activity:"));
        for (const a of result.recent_activity) console.log(`  → ${chalk.cyan(a)}`);
        console.log();
      }

      if (result.relationships?.length) {
        console.log(chalk.bold("Relationships:"));
        for (const r of result.relationships) {
          console.log(`  ${chalk.cyan(r.entity)} ${chalk.dim(`(${r.type})`)}${r.description ? ` — ${chalk.dim(r.description)}` : ""}`);
        }
        console.log();
      }

      if (result.topics?.length) {
        console.log(chalk.bold("Topics:"));
        for (const t of result.topics.slice(0, 10)) {
          console.log(`  • ${t.name} ${chalk.dim(`(${t.fact_count} facts)`)}`);
        }
        console.log();
      }

      if (result.instructions?.length) {
        console.log(chalk.bold("Instructions:"));
        for (const [i, inst] of result.instructions.entries()) {
          console.log(`  ${chalk.dim(`${i + 1}.`)} ${inst}`);
        }
        console.log();
      }

      const s = result.stats;
      if (s) {
        console.log(chalk.bold("Stats:"));
        console.log(`  Memories: ${s.total_memories} total, ${s.memories_7d} last 7d, ${s.memories_30d} last 30d`);
        console.log(`  Entities: ${s.entities_count}`);
        if (s.last_active) console.log(`  Last active: ${s.last_active.slice(0, 10)}`);
        if (Object.keys(s.memory_types).length) {
          console.log(`  Types: ${Object.entries(s.memory_types).map(([k, v]) => `${k}(${v})`).join(", ")}`);
        }
        console.log();
      }

      console.log(chalk.dim(`${result.cached ? "Cached" : "Fresh"} · ${result.latency_ms}ms · ${result.token_estimate} tokens`));
      console.log();
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

// ─── Instructions ────────────────────────────────────────

const instructionsCmd = program
  .command("instructions")
  .description("Manage project instructions (rules all agents receive)");

instructionsCmd
  .command("add <content...>")
  .description("Add an instruction to the current volume")
  .option("-v, --volume <id>", "Volume ID")
  .action(async (contentParts: string[], opts) => {
    const content = contentParts.join(" ");
    const spinner = ora("Adding instruction...").start();

    try {
      const result = await apiFetch("/agent/memory/write", {
        method: "POST",
        body: JSON.stringify({
          content,
          volume_id: opts.volume || getVolumeId(),
          memory_type: "instruction",
          source: "cli",
        }),
      });

      spinner.stop();

      const statusColor = result.status === "approved" ? chalk.green :
                          result.status === "rejected" ? chalk.red : chalk.yellow;

      console.log(`${statusColor(result.status.toUpperCase())} ${chalk.dim(`(${(result.confidence * 100).toFixed(0)}% confidence)`)}`);
      console.log(chalk.dim(`  Memory ID: ${result.memory_id}`));
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

instructionsCmd
  .command("list")
  .description("List all instructions for the current volume")
  .option("-v, --volume <id>", "Volume ID")
  .action(async (opts) => {
    const spinner = ora("Fetching instructions...").start();

    try {
      const vol = opts.volume || getVolumeId();
      const result = await apiFetch(`/agent/memory/list?volume_id=${encodeURIComponent(vol)}&memory_type=instruction`);
      spinner.stop();

      if (!result?.length) {
        console.log(chalk.dim("\nNo instructions set.\n"));
        return;
      }

      console.log(chalk.bold(`\n${result.length} instruction(s):\n`));
      for (const [i, m] of result.entries()) {
        const date = m.created_at ? m.created_at.slice(0, 10) : "";
        console.log(`  ${chalk.dim(`${i + 1}.`)} ${m.content}`);
        console.log(`     ${chalk.dim(`${m.memory_id} · ${date}`)}`);
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

instructionsCmd
  .command("remove <memoryId>")
  .description("Remove an instruction by memory ID")
  .option("-v, --volume <id>", "Volume ID")
  .action(async (memoryId: string, opts) => {
    const spinner = ora("Removing instruction...").start();

    try {
      const vol = opts.volume || getVolumeId();
      await apiFetch(`/agent/memory/${memoryId}?volume_id=${encodeURIComponent(vol)}`, {
        method: "DELETE",
      });
      spinner.stop();
      console.log(chalk.green("✓ Instruction removed"));
    } catch (err: any) {
      spinner.fail(err.message);
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
      const qs = opts.project ? `?org_id=${opts.org}&project_id=${opts.project}` : `?org_id=${opts.org}`;
      const result = await apiFetch(`/agents${qs}`);
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
      console.log(`  Name:     ${chalk.cyan(result.name)}`);
      console.log(`  Agent ID: ${chalk.dim(result.agent_id)}`);
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
