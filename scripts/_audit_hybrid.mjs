import fs from 'fs';

const t = fs.readFileSync('src/ui/MainMenu.ts', 'utf8');
const i = t.indexOf('data-settings-pane="privacy"');
console.log('privacy', i);
console.log(t.slice(i, i + 900));
const j = t.indexOf('data-settings-pane="accessibility"');
console.log('a11y', j);
console.log(t.slice(j, j + 500));

console.log('exists online?', fs.existsSync('src/online'));
console.log('exists server/online?', fs.existsSync('server/online'));

// List key AI files
for (const p of [
  'src/vythera_ai/inference/VytheraAISettings.ts',
  'src/vythera_ai/inference/VytheraInferenceBackend.ts',
  'src/modhub/publish.ts',
  'src/ui/modhub/ModHubApp.ts',
]) {
  console.log(p, fs.existsSync(p));
}
