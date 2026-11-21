import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/deploy.yml', import.meta.url);

test('production workflow deploys main through pinned SSH credentials', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /push:\s*\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /concurrency:\s*\n\s+group: production-deploy/);
  assert.match(workflow, /DEPLOY_HOST: \$\{\{ secrets\.DEPLOY_HOST \}\}/);
  assert.match(workflow, /DEPLOY_USER: \$\{\{ secrets\.DEPLOY_USER \}\}/);
  assert.match(workflow, /DEPLOY_SSH_KEY: \$\{\{ secrets\.DEPLOY_SSH_KEY \}\}/);
  assert.match(workflow, /DEPLOY_KNOWN_HOSTS: \$\{\{ secrets\.DEPLOY_KNOWN_HOSTS \}\}/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /GITHUB_SHA/);
});
