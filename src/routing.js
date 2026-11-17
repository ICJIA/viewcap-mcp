// Decides whether a viewcap invocation is a CLI run or an MCP server start.
// A CLI run names a subcommand anywhere in the args (global flags like
// --allow-js may precede it) or asks for help/version.
export const CLI_COMMANDS = ['capture', 'selector', 'screencast'];

const HELP_VERSION_FLAGS = ['--help', '-h', '--version', '-V'];

// A bare invocation at an interactive terminal (a person typed `viewcap`) is
// also a CLI run, so it prints help instead of silently starting the MCP
// server and waiting for JSON-RPC. MCP clients always pipe stdin, so they
// still get the server.
export function isCliInvocation(args, stdinIsTTY = false) {
  if (args.length === 0 && stdinIsTTY) return true;
  return args.some((a) => CLI_COMMANDS.includes(a) || HELP_VERSION_FLAGS.includes(a));
}
