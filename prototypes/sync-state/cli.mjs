#!/usr/bin/env node
import readline from "node:readline";
import { dispatch, drain, initialState, view } from "./machine.mjs";

const bold = "\x1b[1m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";
let state = initialState();

function render() {
  console.clear();
  console.log(`${bold}Walking Thoughts — sync state prototype${reset}`);
  console.log(`${dim}PROTOTYPE · in-memory · append-only${reset}\n`);
  console.log(JSON.stringify(view(state), null, 2));
  console.log(`\n${bold}Commands${reset}`);
  console.log(`${bold}c${reset} <thread> <text>  ${bold}on${reset}/${bold}off${reset}  ${bold}s${reset} step  ${bold}d${reset} drain  ${bold}f${reset} upload|enrich`);
  console.log(`${bold}r${reset} <job|all>  ${bold}replay${reset} <job>  ${bold}p${reset} during|parallel|failure  ${bold}x${reset} reset  ${bold}q${reset} quit`);
}

function run(actions) {
  for (const action of actions) state = dispatch(state, action);
}

function scenario(name) {
  state = initialState();
  if (name === "during") {
    run([
      { type: "capture", threadId: "trail", text: "What bird made that call?" },
      { type: "connectivity", value: "online" },
      { type: "advance" },
      { type: "advance" },
      { type: "advance" },
    ]);
    run([
      { type: "capture", threadId: "trail", text: "It had a barred chest." },
      { type: "advance" },
      { type: "advance" },
      { type: "advance" },
    ]);
    state = drain(state);
  } else if (name === "parallel") {
    run([
      { type: "capture", threadId: "bones", text: "Photograph roadside skeleton" },
      { type: "capture", threadId: "podcast", text: "Look up this quoted concept" },
      { type: "connectivity", value: "online" },
      { type: "advance" },
      { type: "advance" },
      { type: "advance" },
    ]);
  } else if (name === "failure") {
    run([
      { type: "capture", threadId: "trail", text: "Identify these tracks" },
      { type: "connectivity", value: "online" },
      { type: "failNext", kind: "upload" },
      { type: "advance" },
      { type: "advance" },
    ]);
  } else {
    state.lastEvent = `Unknown scenario: ${name}`;
  }
}

function handle(line) {
  const [command, first, ...rest] = line.trim().split(/\s+/);
  if (command === "q") return false;
  if (command === "c") state = dispatch(state, { type: "capture", threadId: first || "inbox", text: rest.join(" ") || "Untitled Capture" });
  else if (command === "on" || command === "off") state = dispatch(state, { type: "connectivity", value: command === "on" ? "online" : "offline" });
  else if (command === "s") state = dispatch(state, { type: "advance" });
  else if (command === "d") state = drain(state);
  else if (command === "f") state = dispatch(state, { type: "failNext", kind: first === "upload" ? "upload" : "enrich" });
  else if (command === "r") state = dispatch(state, { type: "retry", jobId: first || "all" });
  else if (command === "replay") state = dispatch(state, { type: "replay", jobId: first });
  else if (command === "p") scenario(first);
  else if (command === "x") state = initialState();
  else if (command !== "show" && command !== "") state.lastEvent = `Unknown command: ${command}`;
  return true;
}

if (process.argv.includes("--demo")) {
  for (const name of ["during", "parallel", "failure"]) {
    scenario(name);
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(view(state), null, 2));
  }
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
render();
rl.setPrompt("\n> ");
rl.prompt();
rl.on("line", (line) => {
  if (!handle(line)) return rl.close();
  render();
  rl.prompt();
});
