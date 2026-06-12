'use strict';

/**
 * Detects whether the Claude desktop app is running, and (optionally) whether
 * it is the focused/foreground window. Uses only built-in OS tools so there
 * are no native dependencies to compile.
 *
 *   - Running check:  `tasklist` (Windows) / `ps` (macOS, Linux)
 *   - Foreground check (optional): a generated PowerShell script using the
 *     Win32 GetForegroundWindow API (Windows) / `osascript` (macOS).
 */

const fs = require('fs');
const { exec } = require('child_process');
const { ensureDataDir, foregroundScriptPath } = require('./paths');

/** Runs a shell command, resolving its stdout ('' on any error/timeout). */
function run(cmd, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const child = exec(
      cmd,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => resolve(err ? '' : stdout || '')
    );
    child.on('error', () => resolve(''));
  });
}

/** Normalises a process name for comparison: lowercase, no ".exe". */
function norm(name) {
  return String(name || '').trim().toLowerCase().replace(/\.exe$/, '');
}

/** Returns a Set of normalised names of all currently-running processes. */
async function getRunningProcessNames() {
  const set = new Set();
  if (process.platform === 'win32') {
    const out = await run('tasklist /NH /FO CSV');
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)"/); // first CSV column = image name
      if (m) set.add(norm(m[1]));
    }
  } else {
    const out = await run('ps -A -o comm=');
    for (const line of out.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      set.add(norm(t.split('/').pop())); // basename of the command path
    }
  }
  return set;
}

/** True if any configured Claude process name is currently running. */
async function isClaudeRunning(processNames) {
  const running = await getRunningProcessNames();
  const targets = (processNames || []).map(norm).filter(Boolean);
  return targets.some((t) => running.has(t));
}

const FOREGROUND_PS1 = `$ErrorActionPreference='SilentlyContinue'
$sig=@"
using System;
using System.Runtime.InteropServices;
public class FgWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
Add-Type -TypeDefinition $sig
$h=[FgWin]::GetForegroundWindow()
$p=0
[void][FgWin]::GetWindowThreadProcessId($h,[ref]$p)
(Get-Process -Id $p).ProcessName
`;

/** Writes the foreground-detection PowerShell script once and returns its path. */
function ensureForegroundScript() {
  ensureDataDir();
  const p = foregroundScriptPath();
  try {
    if (!fs.existsSync(p)) fs.writeFileSync(p, FOREGROUND_PS1);
  } catch (_) {
    /* ignore */
  }
  return p;
}

/** Name of the current foreground-window process, or null if undetectable. */
async function getForegroundProcessName() {
  try {
    if (process.platform === 'win32') {
      const script = ensureForegroundScript();
      const out = await run(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${script}"`,
        6000
      );
      return out.trim() ? norm(out) : null;
    }
    if (process.platform === 'darwin') {
      const out = await run(
        `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
        6000
      );
      return out.trim() ? norm(out) : null;
    }
  } catch (_) {
    /* fall through */
  }
  return null; // unsupported platform or detection failed
}

/**
 * Whether Claude is the focused window.
 * @returns true / false, or null when it can't be determined.
 */
async function isClaudeActive(processNames) {
  const fg = await getForegroundProcessName();
  if (fg === null) return null;
  const targets = (processNames || []).map(norm).filter(Boolean);
  return targets.includes(fg);
}

module.exports = {
  getRunningProcessNames,
  isClaudeRunning,
  getForegroundProcessName,
  isClaudeActive,
  norm,
};
