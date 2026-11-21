import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptPath = new URL('../../ops/deploy.sh', import.meta.url);
const sshWrapperPath = new URL('../../ops/deploy-ssh.sh', import.meta.url);

test('deployment script builds an isolated release and rolls back an unhealthy switch', async () => {
  const script = await readFile(scriptPath, 'utf8');

  assert.match(script, /set -Eeuo pipefail/);
  assert.match(script, /\[\[ ! "\$commit_sha" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(script, /flock -n 9/);
  assert.match(script, /merge-base --is-ancestor/);
  assert.match(script, /pnpm install --frozen-lockfile/);
  assert.match(script, /pnpm build/);
  assert.match(script, /mv -Tf/);
  assert.match(script, /curl -fsS --max-time 5 http:\/\/127\.0\.0\.1:3000\//);
  assert.match(script, /rollback_release/);
  assert.match(script, /if ! sudo \/usr\/bin\/systemctl restart "\$service_name"/);
  assert.match(script, /if ! sudo \/usr\/bin\/systemctl restart "\$worker_service_name"/);
  assert.match(script, /tail -n \+4/);

  assert.ok(
    script.indexOf('pnpm build') < script.indexOf('mv -Tf'),
    'the release must finish building before the active symlink changes',
  );
});

test('SSH deployment key can invoke only a deploy command with a full SHA', async () => {
  const wrapper = await readFile(sshWrapperPath, 'utf8');

  assert.match(wrapper, /SSH_ORIGINAL_COMMAND/);
  assert.match(wrapper, /\^deploy\\ \(\[0-9a-f\]\{40\}\)\$/);
  assert.match(wrapper, /exec "\$HOME\/bin\/totoro-deploy"/);
  assert.match(wrapper, /exit 64/);
});
