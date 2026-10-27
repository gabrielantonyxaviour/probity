// probity CLI: run | callback | outcome | note | rerun | health | warmup. parseArgs only, the same zod schemas as the API.
// Exit codes: 0 success, 3 partial_success, 1 run error, 2 invalid input, 4 locked or busy.
import "../lib/net";
import { callbackCommand, noteCommand, outcomeCommand } from "./commands/human";
import { healthCommand, rerunCommand } from "./commands/ops";
import { runCommand } from "./commands/run";
import { EXIT, err, out } from "./context";
import { warmupCommand } from "./warmup";

const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  run: runCommand,
  callback: callbackCommand,
  outcome: outcomeCommand,
  note: noteCommand,
  rerun: rerunCommand,
  health: healthCommand,
  warmup: warmupCommand,
};

const USAGE = `probity <command> [flags]

  run       --input <file|dir> | --example <id> | --name "<company>" [--uei U] [--cik C]
            [--claim-remit "<line1>, <city>, <ST> <zip>"] [--claim-routing N --claim-account N] [--claim-email A]
            [--payment-run PR-..] [--received-at ISO] [--simulate-outage usaspending,edgar] [--sample] [--json]
            [--api URL] [--local] [--save-example DIR] [--budget SECONDS]
  callback  --request BCR-.. --vendor V-.. --phone <number> --outcome confirmed|denied|no_answer --by "<name>" [--source S] [--no-reevaluate]
  outcome   --request BCR-.. --outcome fraud_confirmed|legitimate --by "<name>"
  note      --vendor V-.. --text "<note>" --by "<name>"
  rerun     --run <run_id> --query <query_id>
  health    [--ready]
  warmup    [--list]
`;

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    out(USAGE);
    return cmd ? EXIT.ok : EXIT.invalid;
  }
  const fn = COMMANDS[cmd];
  if (!fn) {
    err(`[ERROR] unknown command "${cmd}". Run probity --help.`);
    return EXIT.invalid;
  }
  try {
    return await fn(rest);
  } catch (e) {
    const code = (e as { code?: string }).code;
    err(`[ERROR] ${code === "state_locked" || code === "world_model_locked" ? "Another run is writing memory. Retry in a minute." : "Internal error."}`);
    return code === "state_locked" || code === "world_model_locked" ? EXIT.locked : EXIT.error;
  }
}

/** Only when this file is the entry (node app/cli/main.ts, bin/probity.mjs): importing it, as the tests do, runs nothing. */
if (/(?:main\.ts|probity(?:\.mjs)?)$/.test(process.argv[1] ?? "")) {
  const code = await main(process.argv.slice(2));
  // Open handles (pg pool, timers) must not keep the CLI alive: exit once both streams have flushed.
  process.stderr.write("", () => process.stdout.write("", () => process.exit(code)));
}
