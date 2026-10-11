import { describe, it } from 'node:test';
import assert from 'node:assert';
import { IntentClassifier, toAITaskType } from '../dist/brain/intent.js';

describe('Brain Intent Classification & Routing', () => {
  const classifier = new IntentClassifier();

  it('classifies greetings and casual chatter as CONVERSATION on FAST_PATH', () => {
    const res = classifier.classify('Hello JARVIS! Good morning!');
    assert.strictEqual(res.intent, 'CONVERSATION');
    assert.strictEqual(res.isFastPath, true);
    assert.strictEqual(res.taskType, 'GENERAL');
  });

  it('classifies simple calculations and definitions as INFORMATION on FAST_PATH', () => {
    const res1 = classifier.classify('what is 2 + 2');
    assert.strictEqual(res1.intent, 'INFORMATION');
    assert.strictEqual(res1.isFastPath, true);

    const res2 = classifier.classify('define polymorphism');
    assert.strictEqual(res2.intent, 'INFORMATION');
    assert.strictEqual(res2.isFastPath, true);
  });

  it('classifies programming requests as CODING on COMPLEX_PATH', () => {
    const res = classifier.classify('Write a python function to compute fibonacci numbers');
    assert.strictEqual(res.intent, 'CODING');
    assert.strictEqual(res.taskType, 'CODING');
    assert.strictEqual(res.isFastPath, false);
  });

  it('classifies comparative analysis as RESEARCH on COMPLEX_PATH', () => {
    const res = classifier.classify('Research and compare SQLite vs PostgreSQL for local embedded applications');
    assert.strictEqual(res.intent, 'RESEARCH');
    assert.strictEqual(res.taskType, 'RESEARCH');
    assert.strictEqual(res.isFastPath, false);
  });

  it('classifies multi-step workflows as AUTOMATION on COMPLEX_PATH', () => {
    const res = classifier.classify('Automate the test suite and then create a deployment artifact');
    assert.strictEqual(res.intent, 'AUTOMATION');
    assert.strictEqual(res.isFastPath, false);
  });

  it('correctly maps system TaskType to provider AITaskType via toAITaskType', () => {
    assert.strictEqual(toAITaskType('CODING'), 'CODING');
    assert.strictEqual(toAITaskType('RESEARCH'), 'RESEARCH');
    assert.strictEqual(toAITaskType('PLANNING'), 'PLANNING');
    assert.strictEqual(toAITaskType('AUTOMATION'), 'ANALYSIS');
    assert.strictEqual(toAITaskType('EXECUTION'), 'GENERAL');
    assert.strictEqual(toAITaskType('GENERAL'), 'GENERAL');
  });
});
