import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCli } from '../dist/cli/cli.js';

describe('CLI AI Commands & Diagnostics', () => {
  it('registers provider, model, and ai commands with options in Commander', () => {
    const cli = createCli();

    const commandNames = cli.commands.map((c) => c.name());
    assert.ok(commandNames.includes('provider'), 'Should include provider command');
    assert.ok(commandNames.includes('model'), 'Should include model command');
    assert.ok(commandNames.includes('ai'), 'Should include ai command');

    // Provider subcommands
    const providerCmd = cli.commands.find((c) => c.name() === 'provider')!;
    const providerSubcommands = providerCmd.commands.map((c) => c.name());
    assert.ok(providerSubcommands.includes('list'));
    assert.ok(providerSubcommands.includes('health'));

    // Model subcommands
    const modelCmd = cli.commands.find((c) => c.name() === 'model')!;
    const modelSubcommands = modelCmd.commands.map((c) => c.name());
    assert.ok(modelSubcommands.includes('list'));

    // AI subcommands
    const aiCmd = cli.commands.find((c) => c.name() === 'ai')!;
    const aiSubcommands = aiCmd.commands.map((c) => c.name());
    assert.ok(aiSubcommands.includes('route'));
    assert.ok(aiSubcommands.includes('test'));
  });
});
