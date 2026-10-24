import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PORT = process.env.MOBILE_PORT || "5180";
const SUPABASE_LOCAL_URL = process.env.SUPABASE_LOCAL_URL || "http://127.0.0.1:61321";
const CLOUDFLARED =
  process.env.CLOUDFLARED_PATH ||
  (existsSync("C:\\Program Files (x86)\\cloudflared\\cloudflared.exe")
    ? "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe"
    : "cloudflared");

function startTunnel(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      CLOUDFLARED,
      ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    const timer = setTimeout(() => {
      cleanup();
      proc.kill();
      reject(new Error(`cloudflared did not print a URL in time.\n${output}`));
    }, 45000);
    function cleanup() {
      clearTimeout(timer);
      proc.stdout.off("data", onData);
      proc.stderr.off("data", onData);
    }
    function onData(chunk) {
      output += chunk.toString();
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        cleanup();
        resolve({ proc, url: match[0] });
      }
    }
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudflared exited with code ${code}.\n${output}`));
    });
  });
}

let tunnel;
let vite;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (vite && !vite.killed) vite.kill();
  if (tunnel && !tunnel.killed) tunnel.proc.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  console.log(`Starting Cloudflare quick tunnel for port ${PORT}...`);
  tunnel = await startTunnel(PORT);
  const supabaseUrl = `${tunnel.url}/supabase`;
  console.log(`Tunnel ready: ${tunnel.url}\n`);

  const viteBin = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  vite = spawn(
    process.execPath,
    [viteBin, "--host", "127.0.0.1", "--port", PORT, "--strictPort"],
    {
      stdio: "inherit",
      env: { ...process.env, VITE_SUPABASE_URL: supabaseUrl },
    },
  );

  console.log("\n=====================================================");
  console.log(`  Open on your phone: ${tunnel.url}`);
  console.log(`  Supabase traffic is proxied via /supabase -> ${SUPABASE_LOCAL_URL}`);
  console.log("  Keep this window open. Press Ctrl+C to stop.");
  console.log("=====================================================\n");

  vite.on("exit", (code) => shutdown(code ?? 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
