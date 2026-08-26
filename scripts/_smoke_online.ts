import { startVytheraOnlineServer } from '../server/online/app.ts';

async function main() {
  const server = await startVytheraOnlineServer();
  try {
    const healthRes = await fetch('http://127.0.0.1:8788/api/v1/health');
    const health = await healthRes.json();
    if (healthRes.status !== 200 || health.status !== 'ok') {
      throw new Error(`health failed: ${healthRes.status} ${JSON.stringify(health)}`);
    }

    const email = `smoke_${Date.now()}@example.com`;
    const regRes = await fetch('http://127.0.0.1:8788/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password12345', displayName: 'Smoke' }),
    });
    const reg = (await regRes.json()) as { accessToken?: string; error?: string };
    if (regRes.status !== 201 || !reg.accessToken) {
      throw new Error(`register failed: ${regRes.status} ${JSON.stringify(reg)}`);
    }

    const chatRes = await fetch('http://127.0.0.1:8788/api/v1/inference/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${reg.accessToken}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello from smoke test' }],
        privacy: 'PUBLIC',
      }),
    });
    if (chatRes.status !== 200) {
      throw new Error(`chat failed: ${chatRes.status} ${await chatRes.text()}`);
    }

    const leakRes = await fetch('http://127.0.0.1:8788/api/v1/inference/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${reg.accessToken}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'open C:\\Users\\secret\\dataset' }],
        privacy: 'PUBLIC',
      }),
    });
    if (leakRes.status !== 400) {
      throw new Error(`expected private path rejection, got ${leakRes.status}`);
    }

    const anon = await fetch('http://127.0.0.1:8788/api/v1/inference/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'anon' }] }),
    });
    if (anon.status !== 401) {
      throw new Error(`expected auth required for inference, got ${anon.status}`);
    }

    console.log('online smoke: ok');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
