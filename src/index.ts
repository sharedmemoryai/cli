#!/usr/bin/env node

import { Command } from "commander";
import Conf from "conf";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { exec } from "child_process";
import http from "http";
import crypto from "crypto";

const config = new Conf({ projectName: "sharedmemory" });
const program = new Command();

// ═══════════════════════════════════════════════════════
//  BRANDING
// ═══════════════════════════════════════════════════════

const BRAND = chalk.hex("#60A5FA").bold;
const DIM = chalk.dim;
const SUCCESS = chalk.green;
const WARN = chalk.yellow;
const ERR = chalk.red;
const ACCENT = chalk.cyan;
const LABEL = chalk.hex("#A78BFA");

function banner() {
  console.log();
  console.log(
    `  ${BRAND("▸ SharedMemory")} ${DIM("CLI v2.4.2")}`,
  );
  console.log(DIM("  Persistent memory for AI agents"));
  console.log();
}

function divider(title?: string) {
  if (title) {
    const line = "─".repeat(Math.max(0, 42 - title.length));
    console.log(DIM(`  ── ${chalk.white.bold(title)} ${line}`));
  } else {
    console.log(DIM("  " + "─".repeat(48)));
  }
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function getBaseUrl(): string {
  return (
    process.env.SM_BASE_URL ||
    (config.get("baseUrl") as string) ||
    "https://api.sharedmemory.ai"
  );
}

function getApiKey(): string {
  return (
    process.env.SM_API_KEY || (config.get("apiKey") as string) || ""
  );
}

function requireApiKey(): string {
  const key = getApiKey();
  if (!key) {
    console.log(
      ERR("\n  ✗ No API key configured.\n"),
    );
    console.log(
      DIM("  Run ") +
        ACCENT("sm init") +
        DIM(" to set up, or ") +
        ACCENT("sm config --api-key <key>") +
        DIM(" to set manually.\n"),
    );
    process.exit(1);
  }
  return key;
}

function getVolumeId(): string {
  return (
    process.env.SM_VOLUME_ID || (config.get("volumeId") as string) || ""
  );
}

function requireVolumeId(): string {
  const vol = getVolumeId();
  if (!vol) {
    console.log(
      ERR("\n  ✗ No volume selected.\n"),
    );
    console.log(
      DIM("  Run ") +
        ACCENT("sm use") +
        DIM(" to pick a volume interactively, or ") +
        ACCENT("sm config --volume <id>") +
        DIM(".\n"),
    );
    process.exit(1);
  }
  return vol;
}

async function apiFetch(
  path: string,
  opts: RequestInit = {},
): Promise<any> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${requireApiKey()}`,
    ...((opts.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${url}"`);
}

// ═══════════════════════════════════════════════════════
//  LOGIN — Browser-based auth
// ═══════════════════════════════════════════════════════

async function loginFlow() {
  banner();
  divider("Login");
  console.log();

  const existingKey = getApiKey();
  if (existingKey) {
    const masked =
      existingKey.slice(0, 12) + "•".repeat(8) + existingKey.slice(-4);
    console.log(`  ${SUCCESS("✓")} Already authenticated: ${DIM(masked)}`);
    const { reauth } = await inquirer.prompt([
      {
        type: "confirm",
        name: "reauth",
        message: "Re-authenticate?",
        default: false,
        prefix: "  ",
      },
    ]);
    if (!reauth) {
      console.log();
      return;
    }
  }

  const { method } = await inquirer.prompt([
    {
      type: "list",
      name: "method",
      message: "How would you like to authenticate?",
      prefix: "  ",
      choices: [
        {
          name: `Log in with browser  ${DIM("(recommended)")}`,
          value: "browser",
        },
        {
          name: `Paste an API key`,
          value: "paste",
        },
      ],
    },
  ]);

  let apiKey = "";

  if (method === "browser") {
    apiKey = await browserAuthFlow();
  } else {
    const { key } = await inquirer.prompt([
      {
        type: "password",
        name: "key",
        message: "API Key:",
        mask: "•",
        prefix: "  ",
        validate: (v: string) =>
          v.startsWith("sm_") ? true : 'Key should start with "sm_"',
      },
    ]);
    apiKey = key;
  }

  config.set("apiKey", apiKey);
  console.log(`  ${SUCCESS("✓")} API key saved`);
  console.log();

  // Skip volume selection if one is already configured
  const existingVol = getVolumeId();
  if (existingVol) {
    console.log(`  ${SUCCESS("✓")} Volume: ${DIM(existingVol.slice(0, 8) + "…")} ${DIM("(already set)")}`);
  } else {
    // No volume yet — fetch and let user pick
    const spinner = ora({ text: "Fetching your volumes...", indent: 2 }).start();
    try {
      const volumes = await apiFetch("/agent/volumes");
      spinner.stop();

      if (volumes.length) {
        const { selectedVolume } = await inquirer.prompt([
          {
            type: "list",
            name: "selectedVolume",
            message: "Select a volume:",
            prefix: "  ",
            choices: volumes.map((v: any) => ({
              name: `${v.name} ${DIM(`(${v.volume_id.slice(0, 8)}…)`)}`,
              value: v.volume_id,
              short: v.name,
            })),
            loop: false,
          },
        ]);

        config.set("volumeId", selectedVolume);
        const volName =
          volumes.find((v: any) => v.volume_id === selectedVolume)?.name ||
          selectedVolume;
        console.log(`  ${SUCCESS("✓")} Volume: ${chalk.white.bold(volName)}`);
      } else {
        console.log(
          WARN("  No volumes found. Create one at ") +
            ACCENT("https://app.sharedmemory.ai"),
        );
      }
    } catch {
      spinner.fail("Could not fetch volumes (check your API key)");
    }
  }

  console.log();
  divider();
  console.log();
  console.log(`  ${SUCCESS("✓")} ${chalk.white.bold("Authenticated!")}`);
  console.log();
  console.log(DIM("  Try these:"));
  console.log(`    ${ACCENT("sm ask")} ${DIM('"What do you know about me?"')}`);
  console.log(`    ${ACCENT("sm add")} ${DIM('"I prefer TypeScript over JavaScript"')}`);
  console.log(`    ${ACCENT("sm search")} ${DIM('"preferences"')}`);
  console.log();
}

/**
 * GitHub-style browser auth: start local server, open browser, wait for callback.
 */
function browserAuthFlow(): Promise<string> {
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(20).toString("hex");
    const TIMEOUT_MS = 120_000; // 2 minutes

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost`);

      if (url.pathname === "/callback") {
        const token = url.searchParams.get("token");
        const returnedState = url.searchParams.get("state");

        if (returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h2>&#10007; State mismatch — please try again.</h2></body></html>");
          cleanup();
          reject(new Error("State mismatch"));
          return;
        }

        if (!token) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h2>&#10007; No token received.</h2></body></html>");
          cleanup();
          reject(new Error("No token received"));
          return;
        }

        // Success!
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:white;">
          <div style="text-align:center">
            <h1 style="color:#22c55e">&#10003; CLI Authenticated!</h1>
            <p id="msg" style="color:#9ca3af">You can close this tab and return to your terminal.</p>
          </div>
          <script>try{setTimeout(()=>window.close(),1000)}catch(e){}</script>
        </body></html>`);

        cleanup();
        resolve(token);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    let timer: NodeJS.Timeout;

    function cleanup() {
      clearTimeout(timer);
      server.close();
    }

    // Listen on random port
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start local server"));
        return;
      }
      const port = addr.port;

      const appUrl = `https://app.sharedmemory.ai/cli-auth?port=${port}&state=${state}`;

      console.log();
      console.log(
        `  ${DIM("Opening")} ${ACCENT("SharedMemory")} ${DIM("in your browser...")}`,
      );
      console.log(
        `  ${DIM("Waiting for authentication...")}`,
      );
      console.log();
      console.log(
        `  ${DIM("If the browser didn't open, visit:")}`,
      );
      console.log(`  ${ACCENT(appUrl)}`);
      console.log();

      openBrowser(appUrl);

      // Timeout after 2 minutes — fall back to paste
      timer = setTimeout(async () => {
        cleanup();
        console.log(
          WARN("  ⚠ Browser auth timed out."),
        );
        console.log();

        const { key } = await inquirer.prompt([
          {
            type: "password",
            name: "key",
            message: "Paste API key manually:",
            mask: "•",
            prefix: "  ",
            validate: (v: string) =>
              v.startsWith("sm_") ? true : 'Key should start with "sm_"',
          },
        ]);
        resolve(key);
      }, TIMEOUT_MS);
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

program
  .command("login")
  .description("Authenticate with SharedMemory (opens browser)")
  .action(loginFlow);

// ═══════════════════════════════════════════════════════
//  INIT — Interactive setup wizard (alias for login)
// ═══════════════════════════════════════════════════════

program
  .command("init")
  .description("Interactive setup wizard")
  .action(async () => {
    banner();
    divider("Setup");
    console.log();

    // Step 1: API Key
    const existingKey = getApiKey();
    let apiKey = existingKey;

    if (existingKey) {
      const masked =
        existingKey.slice(0, 12) + "•".repeat(8) + existingKey.slice(-4);
      console.log(`  ${SUCCESS("✓")} API key: ${DIM(masked)}`);
      const { changeKey } = await inquirer.prompt([
        {
          type: "confirm",
          name: "changeKey",
          message: "Change API key?",
          default: false,
          prefix: "  ",
        },
      ]);
      if (changeKey) apiKey = "";
    }

    if (!apiKey) {
      console.log(
        DIM(
          `  Get your key at ${ACCENT("https://app.sharedmemory.ai")} → API Keys`,
        ),
      );
      const { key } = await inquirer.prompt([
        {
          type: "password",
          name: "key",
          message: "API Key:",
          mask: "•",
          prefix: "  ",
          validate: (v: string) =>
            v.startsWith("sm_") ? true : "Key should start with sm_",
        },
      ]);
      apiKey = key;
    }

    config.set("apiKey", apiKey);
    console.log(`  ${SUCCESS("✓")} API key saved`);
    console.log();

    // Step 2: Fetch volumes and let user pick
    const spinner = ora({ text: "Fetching your volumes...", indent: 2 }).start();
    let volumes: any[] = [];
    try {
      volumes = await apiFetch("/agent/volumes");
      spinner.stop();
    } catch {
      spinner.fail("Could not fetch volumes (check your API key)");
      process.exit(1);
    }

    if (!volumes.length) {
      console.log(
        WARN("  No volumes found. Create one at ") +
          ACCENT("https://app.sharedmemory.ai"),
      );
      console.log();
      return;
    }

    const currentVol = getVolumeId();
    const { selectedVolume } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedVolume",
        message: "Select a volume:",
        prefix: "  ",
        choices: volumes.map((v: any) => ({
          name: `${v.name} ${DIM(`(${v.volume_id.slice(0, 8)}…)`)}`,
          value: v.volume_id,
          short: v.name,
        })),
        default: currentVol || undefined,
        loop: false,
      },
    ]);

    config.set("volumeId", selectedVolume);
    const volName =
      volumes.find((v: any) => v.volume_id === selectedVolume)?.name ||
      selectedVolume;
    console.log(`  ${SUCCESS("✓")} Volume: ${chalk.white.bold(volName)}`);
    console.log();

    // Done
    divider();
    console.log();
    console.log(`  ${SUCCESS("✓")} ${chalk.white.bold("You're all set!")}`);
    console.log();
    console.log(DIM("  Try these:"));
    console.log(`    ${ACCENT("sm ask")} ${DIM('"What do you know about me?"')}`);
    console.log(`    ${ACCENT("sm add")} ${DIM('"I prefer TypeScript over JavaScript"')}`);
    console.log(`    ${ACCENT("sm search")} ${DIM('"preferences"')}`);
    console.log();
  });

// ═══════════════════════════════════════════════════════
//  USE — Switch volume interactively
// ═══════════════════════════════════════════════════════

program
  .command("use")
  .description("Switch active volume (interactive)")
  .action(async () => {
    const spinner = ora({ text: "Fetching volumes...", indent: 2 }).start();

    try {
      const volumes = await apiFetch("/agent/volumes");
      spinner.stop();

      if (!volumes.length) {
        console.log(
          WARN("\n  No volumes found. Create one at ") +
            ACCENT("https://app.sharedmemory.ai\n"),
        );
        return;
      }

      const currentVol = getVolumeId();
      const { selected } = await inquirer.prompt([
        {
          type: "list",
          name: "selected",
          message: "Select volume:",
          prefix: "  ",
          choices: volumes.map((v: any) => ({
            name: `${currentVol === v.volume_id ? SUCCESS("● ") : "  "}${v.name} ${DIM(`(${v.volume_id.slice(0, 8)}…)`)}`,
            value: v.volume_id,
            short: v.name,
          })),
          default: currentVol || undefined,
          loop: false,
        },
      ]);

      config.set("volumeId", selected);
      const name =
        volumes.find((v: any) => v.volume_id === selected)?.name || selected;
      console.log(`\n  ${SUCCESS("✓")} Switched to ${chalk.white.bold(name)}\n`);
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ═══════════════════════════════════════════════════════
//  ── CORE COMMANDS ──
// ═══════════════════════════════════════════════════════

// ─── Ask ────────────────────────────────────────────────

program
  .command("ask [question...]")
  .description("Ask a question — LLM answers using your memory")
  .option("-v, --volume <id>", "Volume ID")
  .option("--learn", "Auto-learn from the conversation")
  .action(async (questionParts: string[], opts) => {
    let query = questionParts.join(" ");

    // Interactive mode if no question given
    if (!query.trim()) {
      const { q } = await inquirer.prompt([
        {
          type: "input",
          name: "q",
          message: "What do you want to know?",
          prefix: "  ",
          validate: (v: string) => (v.trim() ? true : "Enter a question"),
        },
      ]);
      query = q;
    }

    const spinner = ora({ text: "Thinking...", indent: 2 }).start();

    try {
      const result = await apiFetch("/agent/memory/chat", {
        method: "POST",
        body: JSON.stringify({
          query,
          volume_id: opts.volume || requireVolumeId(),
          auto_learn: opts.learn || false,
        }),
      });

      spinner.stop();
      console.log();

      if (result.answer) {
        console.log(result.answer);
        console.log();
      }

      if (result.sources?.length) {
        divider(`${result.sources.length} sources`);
        console.log();
        for (const [i, m] of result.sources.entries()) {
          const scoreStr =
            typeof m.score === "number"
              ? `${(m.score * 100).toFixed(0)}%`
              : "";
          const preview = m.content?.slice(0, 100) + (m.content?.length > 100 ? "…" : "");
          console.log(
            `  ${DIM(`${i + 1}.`)} ${DIM(scoreStr)} ${preview}`,
          );
        }
        console.log();
      }

      if (result.citations?.length) {
        const verified = result.citations.filter(
          (c: any) => c.status === "verified",
        ).length;
        if (verified > 0) {
          console.log(
            DIM(`  ${verified} citation(s) verified from memory.\n`),
          );
        }
      }
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ─── Add ────────────────────────────────────────────────

program
  .command("add [content...]")
  .description("Add a memory to the current volume")
  .option("-v, --volume <id>", "Volume ID")
  .option("-t, --type <type>", "Memory type (factual, episodic, procedural)", "factual")
  .option("-d, --date <date>", "Event date (ISO format, e.g. 2026-04-22)")
  .option("-a, --agent <name>", "Agent name", "cli")
  .action(async (contentParts: string[], opts) => {
    let content = contentParts.join(" ");

    if (!content.trim()) {
      const { text } = await inquirer.prompt([
        {
          type: "input",
          name: "text",
          message: "Memory to store:",
          prefix: "  ",
          validate: (v: string) => (v.trim() ? true : "Enter some content"),
        },
      ]);
      content = text;
    }

    const spinner = ora({ text: "Adding memory...", indent: 2 }).start();

    try {
      const body: any = {
        content,
        volume_id: opts.volume || requireVolumeId(),
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

      const statusColor =
        result.status === "approved"
          ? SUCCESS
          : result.status === "rejected"
            ? ERR
            : WARN;

      console.log();
      console.log(
        `  ${statusColor("●")} ${statusColor(result.status.toUpperCase())} ${DIM(`(${(result.confidence * 100).toFixed(0)}% confidence)`)}`,
      );
      console.log(DIM(`    ${result.reason}`));
      console.log(DIM(`    ID: ${result.memory_id}`));
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ─── Search ─────────────────────────────────────────────

program
  .command("search [query...]")
  .description("Search memories (hybrid: vector + knowledge graph)")
  .option("-v, --volume <id>", "Volume ID")
  .option("-n, --limit <n>", "Max results", "10")
  .option("--from <date>", "Filter from date (ISO)")
  .option("--to <date>", "Filter to date (ISO)")
  .action(async (queryParts: string[], opts) => {
    let q = queryParts.join(" ");

    if (!q.trim()) {
      const { query } = await inquirer.prompt([
        {
          type: "input",
          name: "query",
          message: "Search for:",
          prefix: "  ",
          validate: (v: string) => (v.trim() ? true : "Enter a search query"),
        },
      ]);
      q = query;
    }

    const spinner = ora({ text: "Searching...", indent: 2 }).start();

    try {
      const body: any = {
        query: q,
        volume_id: opts.volume || requireVolumeId(),
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
        console.log(DIM("\n  No results found.\n"));
        return;
      }

      if (result.memories?.length) {
        console.log();
        divider(`${result.memories.length} memories`);
        console.log();
        for (const [i, m] of result.memories.entries()) {
          const pct = Math.round((m.score || 0) * 100);
          const agent = m.agent ? `by ${m.agent}` : "";
          const date = m.created_at ? m.created_at.slice(0, 10) : "";
          console.log(
            `  ${DIM(`${i + 1}.`)} ${DIM(`(${pct}%)`)} ${m.content}`,
          );
          if (agent || date)
            console.log(`     ${DIM(`${agent} · ${date}`)}`);
        }
      }

      if (result.graph_facts?.length) {
        console.log();
        divider(`${result.graph_facts.length} graph facts`);
        console.log();
        for (const f of result.graph_facts) {
          console.log(
            `  ${ACCENT(f.source)} ${DIM("→")} ${LABEL(f.type)} ${DIM("→")} ${ACCENT(f.target)}`,
          );
          if (f.description) console.log(`     ${DIM(f.description)}`);
        }
      }

      console.log();
      console.log(DIM(`  Total: ${result.total_results} results\n`));
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ═══════════════════════════════════════════════════════
//  ── SETUP & MANAGEMENT COMMANDS ──
// ═══════════════════════════════════════════════════════

// ─── Config ─────────────────────────────────────────────

program
  .command("config")
  .description("View or update CLI configuration")
  .option("--api-key <key>", "Set your SharedMemory API key")
  .option("--base-url <url>", "Set the API base URL")
  .option("--volume <id>", "Set the default volume ID")
  .option("--show", "Show current config")
  .action((opts) => {
    let changed = false;

    if (opts.apiKey) {
      config.set("apiKey", opts.apiKey);
      console.log(SUCCESS("  ✓ API key saved"));
      changed = true;
    }
    if (opts.baseUrl) {
      config.set("baseUrl", opts.baseUrl);
      console.log(SUCCESS(`  ✓ Base URL → ${opts.baseUrl}`));
      changed = true;
    }
    if (opts.volume) {
      config.set("volumeId", opts.volume);
      console.log(SUCCESS(`  ✓ Volume → ${opts.volume}`));
      changed = true;
    }

    if (opts.show || !changed) {
      const key = getApiKey();
      const masked = key
        ? key.slice(0, 12) + "•".repeat(6) + key.slice(-4)
        : WARN("not set");
      const vol = getVolumeId() || WARN("not set");

      console.log();
      divider("Configuration");
      console.log();
      console.log(`  ${DIM("API Key")}    ${masked}`);
      console.log(`  ${DIM("Base URL")}   ${getBaseUrl()}`);
      console.log(`  ${DIM("Volume")}     ${vol}`);
      console.log();
      console.log(
        DIM("  Tip: run ") +
          ACCENT("sm init") +
          DIM(" for guided setup, ") +
          ACCENT("sm use") +
          DIM(" to switch volumes"),
      );
      console.log();
    }
  });

// ─── Volumes ────────────────────────────────────────────

program
  .command("volumes")
  .description("List your memory volumes")
  .action(async () => {
    const spinner = ora({ text: "Fetching volumes...", indent: 2 }).start();

    try {
      const result = await apiFetch("/agent/volumes");
      spinner.stop();

      const currentVol = getVolumeId();

      console.log();
      divider("Volumes");
      console.log();
      for (const v of result) {
        const active = v.volume_id === currentVol;
        const marker = active ? SUCCESS("● ") : DIM("  ");
        const suffix = active ? SUCCESS(" ← active") : "";
        console.log(
          `  ${marker}${chalk.white.bold(v.name)} ${DIM(`(${v.volume_id})`)}${suffix}`,
        );
      }
      console.log();
      console.log(
        DIM("  Tip: run ") + ACCENT("sm use") + DIM(" to switch volumes"),
      );
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
    const spinner = ora({ text: "Checking...", indent: 2 }).start();

    try {
      const health = await apiFetch("/health");
      spinner.stop();

      const vol = getVolumeId();

      console.log();
      console.log(`  ${SUCCESS("✓")} ${chalk.white.bold("Connected to SharedMemory")}`);
      console.log();
      console.log(`  ${DIM("URL")}        ${getBaseUrl()}`);
      console.log(`  ${DIM("Volume")}     ${vol || WARN("not set")}`);
      if (health.version) console.log(`  ${DIM("Version")}    ${health.version}`);
      console.log();
    } catch (err: any) {
      spinner.fail(`Cannot connect to ${getBaseUrl()}: ${err.message}`);
    }
  });

// ─── Profile ────────────────────────────────────────────

program
  .command("profile")
  .description("View a comprehensive profile for this volume")
  .option("-v, --volume <id>", "Volume ID")
  .option("-u, --user <id>", "User ID to scope profile")
  .option("--refresh", "Force regenerate (bypass cache)")
  .action(async (opts) => {
    const spinner = ora({ text: "Building profile...", indent: 2 }).start();

    try {
      const vol = opts.volume || requireVolumeId();
      const body: any = { volume_id: vol };
      if (opts.user) body.user_id = opts.user;
      if (opts.refresh) body.refresh = true;

      const result = await apiFetch("/agent/memory/profile", {
        method: "POST",
        body: JSON.stringify(body),
      });

      spinner.stop();
      console.log();

      const title = result.user_id
        ? `Profile: ${result.user_id}`
        : "Volume Profile";
      divider(title);
      console.log();

      if (result.summary) {
        console.log(`  ${DIM(result.summary)}`);
        console.log();
      }

      const sections: [string, string[] | undefined][] = [
        ["Identity", result.identity],
        ["Preferences", result.preferences],
        ["Expertise", result.expertise],
        ["Projects", result.projects],
      ];

      for (const [label, items] of sections) {
        if (items?.length) {
          console.log(`  ${chalk.white.bold(label)}`);
          for (const f of items)
            console.log(`    ${DIM("•")} ${f}`);
          console.log();
        }
      }

      if (result.recent_activity?.length) {
        console.log(`  ${chalk.white.bold("Recent Activity")}`);
        for (const a of result.recent_activity)
          console.log(`    ${ACCENT("→")} ${a}`);
        console.log();
      }

      if (result.relationships?.length) {
        console.log(`  ${chalk.white.bold("Relationships")}`);
        for (const r of result.relationships) {
          console.log(
            `    ${ACCENT(r.entity)} ${DIM(`(${r.type})`)}${r.description ? ` — ${DIM(r.description)}` : ""}`,
          );
        }
        console.log();
      }

      if (result.topics?.length) {
        console.log(`  ${chalk.white.bold("Topics")}`);
        for (const t of result.topics.slice(0, 10)) {
          console.log(
            `    ${DIM("•")} ${t.name} ${DIM(`(${t.fact_count} facts)`)}`,
          );
        }
        console.log();
      }

      if (result.instructions?.length) {
        console.log(`  ${chalk.white.bold("Instructions")}`);
        for (const [i, inst] of result.instructions.entries()) {
          console.log(`    ${DIM(`${i + 1}.`)} ${inst}`);
        }
        console.log();
      }

      const s = result.stats;
      if (s) {
        divider("Stats");
        console.log();
        console.log(
          `  ${DIM("Memories")}   ${s.total_memories} total, ${s.memories_7d} last 7d, ${s.memories_30d} last 30d`,
        );
        console.log(`  ${DIM("Entities")}   ${s.entities_count}`);
        if (s.last_active)
          console.log(`  ${DIM("Last active")} ${s.last_active.slice(0, 10)}`);
        if (Object.keys(s.memory_types).length) {
          console.log(
            `  ${DIM("Types")}      ${Object.entries(s.memory_types).map(([k, v]) => `${k}(${v})`).join(", ")}`,
          );
        }
        console.log();
      }

      console.log(
        DIM(
          `  ${result.cached ? "Cached" : "Fresh"} · ${result.latency_ms}ms · ${result.token_estimate} tokens`,
        ),
      );
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ─── Instructions ────────────────────────────────────────

const instructionsCmd = program
  .command("instructions")
  .description("Manage project instructions (rules all agents receive)");

instructionsCmd
  .command("add [content...]")
  .description("Add an instruction to the current volume")
  .option("-v, --volume <id>", "Volume ID")
  .action(async (contentParts: string[], opts) => {
    let content = contentParts.join(" ");

    if (!content.trim()) {
      const { text } = await inquirer.prompt([
        {
          type: "input",
          name: "text",
          message: "Instruction:",
          prefix: "  ",
          validate: (v: string) => (v.trim() ? true : "Enter an instruction"),
        },
      ]);
      content = text;
    }

    const spinner = ora({ text: "Adding instruction...", indent: 2 }).start();

    try {
      const result = await apiFetch("/agent/memory/write", {
        method: "POST",
        body: JSON.stringify({
          content,
          volume_id: opts.volume || requireVolumeId(),
          memory_type: "instruction",
          source: "cli",
        }),
      });

      spinner.stop();

      const statusColor =
        result.status === "approved"
          ? SUCCESS
          : result.status === "rejected"
            ? ERR
            : WARN;

      console.log(
        `\n  ${statusColor("●")} ${statusColor(result.status.toUpperCase())} ${DIM(`ID: ${result.memory_id}`)}\n`,
      );
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

instructionsCmd
  .command("list")
  .description("List all instructions for the current volume")
  .option("-v, --volume <id>", "Volume ID")
  .action(async (opts) => {
    const spinner = ora({ text: "Fetching instructions...", indent: 2 }).start();

    try {
      const vol = opts.volume || requireVolumeId();
      const result = await apiFetch(
        `/agent/memory/list?volume_id=${encodeURIComponent(vol)}&memory_type=instruction`,
      );
      spinner.stop();

      if (!result?.length) {
        console.log(DIM("\n  No instructions set.\n"));
        return;
      }

      console.log();
      divider(`${result.length} instruction(s)`);
      console.log();
      for (const [i, m] of result.entries()) {
        const date = m.created_at ? m.created_at.slice(0, 10) : "";
        console.log(`  ${DIM(`${i + 1}.`)} ${m.content}`);
        console.log(`     ${DIM(`${m.memory_id} · ${date}`)}`);
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

instructionsCmd
  .command("remove [memoryId]")
  .description("Remove an instruction by memory ID")
  .option("-v, --volume <id>", "Volume ID")
  .action(async (memoryId: string | undefined, opts) => {
    const vol = opts.volume || requireVolumeId();

    // If no ID given, list and let user pick
    if (!memoryId) {
      const spinner = ora({ text: "Fetching instructions...", indent: 2 }).start();
      try {
        const items = await apiFetch(
          `/agent/memory/list?volume_id=${encodeURIComponent(vol)}&memory_type=instruction`,
        );
        spinner.stop();

        if (!items?.length) {
          console.log(DIM("\n  No instructions to remove.\n"));
          return;
        }

        const { selected } = await inquirer.prompt([
          {
            type: "list",
            name: "selected",
            message: "Select instruction to remove:",
            prefix: "  ",
            choices: items.map((m: any, i: number) => ({
              name: `${DIM(`${i + 1}.`)} ${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}`,
              value: m.memory_id,
              short: `#${i + 1}`,
            })),
            loop: false,
          },
        ]);
        memoryId = selected;
      } catch (err: any) {
        spinner.fail(err.message);
        return;
      }
    }

    const spinner2 = ora({ text: "Removing...", indent: 2 }).start();
    try {
      await apiFetch(
        `/agent/memory/${memoryId}?volume_id=${encodeURIComponent(vol)}`,
        { method: "DELETE" },
      );
      spinner2.stop();
      console.log(SUCCESS("\n  ✓ Instruction removed\n"));
    } catch (err: any) {
      spinner2.fail(err.message);
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
    const spinner = ora({ text: "Fetching agents...", indent: 2 }).start();

    try {
      const qs = opts.project
        ? `?org_id=${opts.org}&project_id=${opts.project}`
        : `?org_id=${opts.org}`;
      const result = await apiFetch(`/agents${qs}`);
      spinner.stop();

      if (!result.length) {
        console.log(DIM("\n  No agents found.\n"));
        return;
      }

      console.log();
      divider(`${result.length} agent(s)`);
      console.log();
      for (const a of result) {
        const status = a.is_active ? SUCCESS("active") : ERR("inactive");
        console.log(
          `  ${chalk.white.bold(a.name)} ${DIM(`(${a.agent_id})`)} ${status}`,
        );
        if (a.description) console.log(`    ${DIM(a.description)}`);
        console.log(
          `    ${DIM(`key: ${a.key_prefix}…  created: ${a.created_at?.split("T")[0] || ""}`)}`,
        );
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
    const spinner = ora({ text: "Creating agent...", indent: 2 }).start();

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
      console.log();
      console.log(`  ${SUCCESS("✓")} Agent created`);
      console.log();
      console.log(`  ${DIM("Name")}      ${chalk.white.bold(result.name)}`);
      console.log(`  ${DIM("Agent ID")}  ${result.agent_id}`);
      console.log(`  ${DIM("API Key")}   ${WARN(result.api_key)}`);
      console.log();
      console.log(ERR("  ⚠ Save this key now — it won't be shown again."));
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

agentsCmd
  .command("delete <agent_id>")
  .description("Deactivate an agent and revoke its API key")
  .requiredOption("--org <id>", "Organization ID")
  .action(async (agentId, opts) => {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Deactivate agent ${agentId}? This revokes the API key.`,
        default: false,
        prefix: "  ",
      },
    ]);

    if (!confirm) {
      console.log(DIM("\n  Cancelled.\n"));
      return;
    }

    const spinner = ora({ text: "Deactivating agent...", indent: 2 }).start();

    try {
      await apiFetch(`/agents/${agentId}`, {
        method: "DELETE",
        headers: { "x-org-id": opts.org } as any,
      });
      spinner.stop();
      console.log(SUCCESS("\n  ✓ Agent deactivated and API key revoked.\n"));
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

agentsCmd
  .command("rotate-key <agent_id>")
  .description("Rotate an agent's API key")
  .requiredOption("--org <id>", "Organization ID")
  .action(async (agentId, opts) => {
    const spinner = ora({ text: "Rotating key...", indent: 2 }).start();

    try {
      const result = await apiFetch(`/agents/${agentId}/rotate-key`, {
        method: "POST",
        headers: { "x-org-id": opts.org } as any,
      });
      spinner.stop();
      console.log();
      console.log(`  ${SUCCESS("✓")} Key rotated`);
      console.log(`  ${DIM("New Key")}  ${WARN(result.api_key)}`);
      console.log();
      console.log(ERR("  ⚠ Save this key now — it won't be shown again."));
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// ═══════════════════════════════════════════════════════
//  FIRST-RUN DETECTION
// ═══════════════════════════════════════════════════════

async function maybeFirstRun() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    const key = getApiKey();
    if (!key) {
      banner();
      console.log(
        DIM("  Welcome! Let's get you set up.\n"),
      );
      console.log(
        `  Run ${ACCENT("sm login")} to authenticate via browser, or ${ACCENT("sm init")} for guided setup.\n`,
      );
      process.exit(0);
    }
  }
}

// ═══════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════

program
  .name("sm")
  .description("SharedMemory CLI — persistent memory for AI agents")
  .version("2.3.0")
  .addHelpText("before", `
  ${BRAND("▸ SharedMemory")} ${DIM("CLI v2.4.2")}
  ${DIM("Persistent memory for AI agents")}
`)
  .addHelpText("after", `
${chalk.white.bold("  Quick Start:")}
    ${ACCENT("sm login")}                    ${DIM("Authenticate via browser")}
    ${ACCENT("sm init")}                     ${DIM("Interactive setup wizard")}
    ${ACCENT("sm ask")} ${DIM('"your question"')}       ${DIM("Ask a question (RAG + LLM)")}
    ${ACCENT("sm add")} ${DIM('"some fact"')}           ${DIM("Store a memory")}
    ${ACCENT("sm search")} ${DIM('"query"')}            ${DIM("Search memories")}

${chalk.white.bold("  Management:")}
    ${ACCENT("sm use")}                      ${DIM("Switch volume interactively")}
    ${ACCENT("sm volumes")}                  ${DIM("List all volumes")}
    ${ACCENT("sm profile")}                  ${DIM("View volume profile")}
    ${ACCENT("sm status")}                   ${DIM("Check API connection")}
    ${ACCENT("sm config")}                   ${DIM("View/update configuration")}
    ${ACCENT("sm instructions")} ${DIM("<cmd>")}       ${DIM("Manage project instructions")}
    ${ACCENT("sm agents")} ${DIM("<cmd>")}              ${DIM("Manage agent profiles")}
`);

await maybeFirstRun();
program.parse();
