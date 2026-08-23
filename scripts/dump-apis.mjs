import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = [];
const dump = (label, text) => {
  out.push(`\n===== ${label} =====\n`);
  out.push(text);
};

dump('ChatUi.ts', fs.readFileSync(path.join(root, 'src/ui/ChatUi.ts'), 'utf8'));

const net = fs.readFileSync(path.join(root, 'src/net/NetClient.ts'), 'utf8');
dump('sendChat', net.slice(net.indexOf('sendChat'), net.indexOf('sendChat') + 220));
const chatCase = net.indexOf("case 'chat'");
dump('case chat', net.slice(chatCase, chatCase + 200));
dump('onChat type', (net.match(/onChat\?:[\s\S]*?;/) || [])[0] || 'missing');

const g = fs.readFileSync(path.join(root, 'src/game/Game.ts'), 'utf8');
dump(
  'fields',
  [...g.matchAll(/^\s+private .+$/gm)].map((m) => m[0]).join('\n'),
);
dump('applyPrefs', g.slice(g.indexOf('applyPrefs'), g.indexOf('applyPrefs') + 550));
const tog = g.indexOf('inventoryUi.onToggle');
dump('inv toggle', g.slice(tog, tog + 500));
const init = g.indexOf('initMultiplayer');
dump('init mp end', g.slice(g.lastIndexOf('this.net.on'), g.lastIndexOf('this.net.connect') + 120));

const touch = fs.readFileSync(path.join(root, 'src/ui/TouchControls.ts'), 'utf8');
dump('touch topbar', (touch.match(/touch-top-bar[\s\S]*?touch-look-zone/) || [])[0] || 'missing');
dump('touch bind menu', (touch.match(/data-action=.menu.[\s\S]{0,250}/) || [])[0] || 'missing');

const server = fs.readFileSync(path.join(root, 'server/index.ts'), 'utf8');
dump('player type', (server.match(/type PlayerState = \{[\s\S]*?\};/) || [])[0] || 'missing');
dump('block handler', (server.match(/if \(msg\.t === 'block'\) \{[\s\S]*?\n    \}/) || [])[0] || 'missing');

fs.writeFileSync(path.join(root, 'scripts/_dump.txt'), out.join(''), 'utf8');
console.log('wrote scripts/_dump.txt', out.join('').length);
