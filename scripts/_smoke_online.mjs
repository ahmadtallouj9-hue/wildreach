import { startVytheraOnlineServer } from '../server/online/app.ts';

async function main() {
  const s = await startVytheraOnlineServer();
  try {
    const health = await fetch('http://127.0.0.1:8788/api/v1/health');
    console.log('health', health.status, await health.json());

    const reg = await fetch('http://127.0.0.1:8788/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `t${Date.now()}@example.com`,
        password: 'password12345',
        displayName: 'Tester',
      }),
    });
    const regBody = await reg.json();
    console.log('register', reg.status, regBody);

    const token = regBody.accessToken as string;
    const chat = await fetch('http://127.0.0.1:8788/api/v1/inference/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello VYTHERA' }],
        privacy: 'PUBLIC',
      }),
    });
    console.log('chat', chat.status, await chat.json());

    const denied = await fetch('http://127.0.0.1:8788/api/v1/inference/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'see C:\\Users\\secret\\dataset' }],
        privacy: 'PUBLIC',
      }),
    });
    console.log('private-leak', denied.status, await denied.json());

    const mods = await fetch('http://127.0.0.1:8788/api/v1/mods');
    console.log('mods', mods.status, await mods.json());
  } finally {
    s.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
