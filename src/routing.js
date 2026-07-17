// Decides whether a viewcap invocation is a CLI run or an MCP server start.
// A CLI run names a subcommand anywhere in the args (global flags like
// --allow-js may precede it) or asks for help/version.
export const CLI_COMMANDS = ['capture', 'selector', 'screencast'];

const HELP_VERSION_FLAGS = ['--help', '-h', '--version', '-V'];

export function isCliInvocation(args) {
  return args.some((a) => CLI_COMMANDS.includes(a) || HELP_VERSION_FLAGS.includes(a));
}
