import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...xs) => path.join(root, ...xs);
const read = (...xs) => fs.readFileSync(p(...xs), 'utf8');
const write = (...xs) => {
  const file = xs.pop();
  fs.writeFileSync(p(...xs, file), arguments[arguments.length - 1] ?? xs[xs.length - 1]);
};

// Fix write helper
function writeFile(rel, content) {
  fs.writeFileSync(p(rel), content, 'utf8');
}

const game = read('src/game/Game.ts');
const chat = read('src/ui/ChatUi.ts');
const net = read('src/net/NetClient.ts');
const inv = read('src/ui/InventoryUi.ts');
const touch = read('src/ui/TouchControls.ts');
const main = read('src/main.ts');
const server = read('server/index.ts');
const css = read('src/style.css');

const report = {
  gameHasChat: game.includes('ChatUi'),
  chatClass: (chat.match(/export class (\w+)/) || [])[1],
  chatMethods: [...chat.matchAll(/^\s{2}(get |set |[a-zA-Z]+)\(/gm)].map((m) => m[1]),
  netSendChat: net.includes('sendChat'),
  netOnChat: net.includes('onChat'),
  invFrost: inv.includes('glass-frost'),
  invTransform: /inv-panel[\s\S]{0,200}transform/.test(css),
  invPanelCss: (css.match(/\.inv-panel \{[\s\S]*?\n\}/) || [])[0]?.slice(0, 300),
  gameNetOn: (game.match(/this\.net\.on\(\{[\s\S]*?\n    \}\);/) || [])[0]?.slice(0, 600),
  inventoryOpenName: game.includes('inventoryOpen') ? 'inventoryOpen' : game.includes('inventoryOpen') ? 'inventoryOpen' : '?',
  setPausedSnippet: (game.match(/setPaused\([\s\S]*?\n  \}/) || [])[0],
  touchHandlers: (touch.match(/export type TouchControlHandlers = \{[\s\S]*?\};/) || [])[0],
  mainEscape: (main.match(/keydown[\s\S]*?\}\);/) || [])[0]?.slice(0, 500),
  serverChat: server.includes("'chat'") || server.includes('"chat"'),
  playerField: (game.match(/private playerName[^;]*;/) || [])[0],
  applyPrefs: (game.match(/applyPrefs\([\s\S]{0,250}/) || [])[0],
};

fs.writeFileSync(p('scripts/_inspect.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
