import fs from 'fs';

const g = fs.readFileSync('src/online/privacy/gate.ts', 'utf8');
const r = fs.readFileSync('src/online/ai/VytheraAIRouter.ts', 'utf8');
const c = fs.readFileSync('src/online/client/VytheraOnlineClient.ts', 'utf8');

const gField = (g.match(/online\w*: boolean/) || [])[0];
const rFields = [...r.matchAll(/online\w*:/g)].map((m) => m[0]);
console.log('gate field', JSON.stringify(gField));
console.log('router fields', rFields.map((f) => JSON.stringify(f)));

const methods = [...c.matchAll(/\n  ([a-zA-Z]+)\(/g)].map((m) => m[1]);
console.log('client methods', methods);

// Normalize router to gate's onlineEnabled key
const gateKey = (gField || 'onlineEnabled: boolean').split(':')[0];
console.log('gateKey', gateKey);

let router = r;
// Replace any online*Enabled: with the gate key
router = router.replace(/\bonline[A-Za-z]*Enabled:/g, gateKey + ':');
fs.writeFileSync('src/online/ai/VytheraAIRouter.ts', router);
console.log('router normalized', [...router.matchAll(/online\w*:/g)].map((m) => m[0]));

// Ensure refreshSettings exists for status.ts
if (!methods.includes('refreshSettings')) {
  const existing = methods.find((m) => /refresh|reload/i.test(m));
  if (existing) {
    let client = c;
    if (!client.includes('refreshSettings(): void')) {
      client = client.replace(
        new RegExp(`\\n  ${existing}\\(\\): void \\{[\\s\\S]*?\\n  \\}`),
        (block) => `${block}\n\n  refreshSettings(): void {\n    this.${existing}();\n  }`,
      );
      fs.writeFileSync('src/online/client/VytheraOnlineClient.ts', client);
      console.log('added refreshSettings alias ->', existing);
    }
  } else {
    console.log('NO refresh-like method on client');
  }
} else {
  console.log('refreshSettings already present');
}
