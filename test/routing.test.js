import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCliInvocation, CLI_COMMANDS } from '../src/routing.js';

describe('isCliInvocation', () => {
  it('routes a bare subcommand to the CLI', () => {
    assert.equal(isCliInvocation(['capture', 'http://localhost:3000']), true);
    assert.equal(isCliInvocation(['selector', 'http://localhost:3000', '#main']), true);
    assert.equal(isCliInvocation(['screencast', 'http://localhost:3000']), true);
  });

  it('routes a subcommand preceded by global flags to the CLI', () => {
    assert.equal(isCliInvocation(['--allow-js', 'capture', 'http://localhost:3000']), true);
    assert.equal(isCliInvocation(['--verbose', 'screencast', 'http://localhost:3000']), true);
  });

  it('routes --help and -h to the CLI', () => {
    assert.equal(isCliInvocation(['--help']), true);
    assert.equal(isCliInvocation(['-h']), true);
  });

  it('routes --version and -V to the CLI', () => {
    assert.equal(isCliInvocation(['--version']), true);
    assert.equal(isCliInvocation(['-V']), true);
  });

  it('routes no args to the MCP server', () => {
    assert.equal(isCliInvocation([]), false);
  });

  it('routes server-only flags to the MCP server', () => {
    assert.equal(isCliInvocation(['--allow-js']), false);
    assert.equal(isCliInvocation(['--verbose']), false);
    assert.equal(isCliInvocation(['--quiet']), false);
    assert.equal(isCliInvocation(['--no-restart']), false);
    assert.equal(isCliInvocation(['--allow-js', '--verbose']), false);
  });

  it('does not treat values merely containing a command name as CLI', () => {
    assert.equal(isCliInvocation(['capture-me']), false);
    assert.equal(isCliInvocation(['http://example.com/capture']), false);
  });

  it('exports the three CLI subcommands', () => {
    assert.deepEqual(CLI_COMMANDS, ['capture', 'selector', 'screencast']);
  });
});

describe('isCliInvocation with an interactive terminal', () => {
  it('bare invocation with piped stdin starts the MCP server', () => {
    assert.equal(isCliInvocation([], false), false);
  });
  it('bare invocation at a TTY is a CLI run (prints help)', () => {
    assert.equal(isCliInvocation([], true), true);
  });
  it('server flags alone still start the server, TTY or not', () => {
    assert.equal(isCliInvocation(['--allow-js'], false), false);
    assert.equal(isCliInvocation(['--vision-tier=standard'], false), false);
  });
});
