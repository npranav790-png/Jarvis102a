import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCli } from '../dist/cli/cli.js';

describe('CLI Commands & Parsers', () => {
  it('registers expected commands and options in Commander', () => {
    const cli = createCli();

    const commandNames = cli.commands.map(c => c.name());
    assert.ok(commandNames.includes('status'));
    assert.ok(commandNames.includes('config'));
    assert.ok(commandNames.includes('project'));
    assert.ok(commandNames.includes('session'));
    assert.ok(commandNames.includes('task'));

    // Verify subcommands
    const projectCmd = cli.commands.find(c => c.name() === 'project')!;
    const projectSubcommands = projectCmd.commands.map(c => c.name());
    assert.ok(projectSubcommands.includes('list'));
    assert.ok(projectSubcommands.includes('create'));

    const taskCmd = cli.commands.find(c => c.name() === 'task')!;
    const taskSubcommands = taskCmd.commands.map(c => c.name());
    assert.ok(taskSubcommands.includes('list'));
    assert.ok(taskSubcommands.includes('create'));
    assert.ok(taskSubcommands.includes('show'));
    assert.ok(taskSubcommands.includes('cancel'));
  });
});
