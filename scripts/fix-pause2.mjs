import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gamePath = path.join(root, 'src/game/Game.ts');
let g = fs.readFileSync(gamePath, 'utf8');

// Fix pause action name mismatch resume vs resume — PauseMenu uses 'resume'
g = g.replace("action === 'resume'", "action === 'resume'");
g = g.replace('this.requestPointerLock()', 'this.requestPointerLock()');

// Ensure method exists as requestPointerLock
if (g.includes('private requestPointerLock(') && !g.includes('private requestPointerLock(')) {
  /* noop */
}
if (!g.includes('private requestPointerLock(') && g.includes('this.requestPointerLock()')) {
  g = g.replace('private requestPointerLock(', 'private requestPointerLock(');
}
// Rename whichever exists to match call sites
if (g.includes('this.requestPointerLock()') && g.includes('private requestPointerLock(')) {
  g = g.replace(/private requestPointerLock\(/g, 'private requestPointerLock(');
  g = g.replace(/this\.requestPointerLock\(\)/g, 'this.requestPointerLock()');
}
if (g.includes('this.requestPointerLock()') && g.includes('private requestPointerLock(')) {
  // unify to requestPointerLock
  g = g.replace(/private requestPointerLock\(/g, 'private __plock(');
  g = g.replace(/this\.requestPointerLock\(\)/g, 'this.__plock()');
  g = g.replace(/private __plock\(/g, 'private requestPointerLock(');
  g = g.replace(/this\.__plock\(\)/g, 'this.requestPointerLock()');
}

// Chat API: ChatUi uses onChatSend / onToggle
g = g.replace(/this\.chatUi\.onChatSend\(/g, 'this.chatUi.onChatSend(');
g = g.replace(/this\.chatUi\.onToggle\(/g, 'this.chatUi.onToggle(');
if (g.includes('onChatSend') && !g.includes('this.chatUi.onChatSend')) {
  g = g.replace(/this\.chatUi\.onSend\(/g, 'this.chatUi.onChatSend(');
}
// Actual ChatUi methods from file: onChatSend, onToggle
g = g.replace(/this\.chatUi\.onChatSend\(/g, 'this.chatUi.onChatSend(');
g = g.replace(/this\.chatUi\.onToggle\(/g, 'this.chatUi.onToggle(');

// Force correct ChatUi wiring names based on ChatUi.ts
const chatApi = fs.readFileSync(path.join(root, 'src/ui/ChatUi.ts'), 'utf8');
const sendName = chatApi.includes('onChatSend(') ? 'onChatSend' : chatApi.includes('onSend(') ? 'onSend' : 'onChatSend';
const toggleName = chatApi.includes('onToggle(') ? 'onToggle' : 'onToggle';
g = g.replace(/this\.chatUi\.on(?:ChatSend|Send|Chat)\(/g, `this.chatUi.${sendName}(`);
g = g.replace(/this\.chatUi\.on(?:Toggle|OpenChange)\(/g, `this.chatUi.${toggleName}(`);

// Fix frame playing references
g = g.replace(
  /if \(playing && !hudBlocking\) \{\n      this\.chunks\.updateAround/,
  `if (worldLive && !hudBlocking) {
      this.chunks.updateAround`,
);

// After worldLive block start, ensure player update respects canControl
if (!g.includes('if (canControl) {\n        this.player.update')) {
  g = g.replace(
    /if \(worldLive && !hudBlocking\) \{\n      this\.chunks\.updateAround\(([^;]+);\n      this\.player\.update\(dt\);\n      this\.interaction\.update\(dt\);/,
    `if (worldLive && !hudBlocking) {
      this.chunks.updateAround($1;
      if (canControl) {
        this.player.update(dt);
        this.interaction.update(dt);
      }`,
  );
}

g = g.replace(
  /this\.hud\.setPointerLocked\(this\.player\.aimActive && playing && !hudBlocking\);/,
  'this.hud.setPointerLocked(this.player.aimActive && canControl && !hudBlocking);',
);
g = g.replace(
  /this\.touchControls\?\.setEnabled\(playing && !hudBlocking\);/,
  'this.touchControls?.setEnabled(canControl && !hudBlocking);',
);
g = g.replace(
  /if \(playing && !hudBlocking\) \{\n      this\.net/,
  `if (worldLive && !hudBlocking) {
      this.net`,
);
g = g.replace(/dt: playing \? dt : 0/, 'dt: worldLive ? dt : 0');

// Remove leftover bare `playing` if any remain in frame
const frameStart = g.indexOf('private frame(');
if (frameStart >= 0) {
  const frameEnd = g.indexOf('\n  private init', frameStart);
  let frame = g.slice(frameStart, frameEnd > 0 ? frameEnd : undefined);
  frame = frame.replace(/\bplaying\b/g, 'canControl');
  // undo over-replace of worldLive line if mangled
  frame = frame.replace(
    'const worldLive = !this.paused && !this.inventoryUi.isOpen;\n    const canControl = worldLive && !this.chatUi.isOpen;\n    const hudBlocking',
    'const worldLive = !this.paused && !this.inventoryUi.isOpen;\n    const canControl = worldLive && !this.chatUi.isOpen;\n    const hudBlocking',
  );
  if (frameEnd > 0) g = g.slice(0, frameStart) + frame + g.slice(frameEnd);
  else g = g.slice(0, frameStart) + frame;
}

// onMenuRequest callback for title
g = g.replace(/this\.onMenuRequest\?\.\(\)/g, 'this.onMenuRequest?.()');
if (g.includes('this.onMenuRequest?.()') && g.includes('onMenuRequest:')) {
  g = g.replace(/this\.onMenuRequest\?\.\(\)/g, 'this.onMenuRequest?.()');
}

// Touch menu
g = g.replace(/onMenu: \(\) => this\.onMenuRequest\?\.\(\),/g, 'onMenu: () => this.setPaused(true),');

// isTouchDevice import usage in helpers — file imports isTouchDevice
g = g.replace(/\bisTouchDevice\(\)/g, (m, offset) => {
  // keep import line
  return m;
});
// Actually helpers used isTouchDevice — ensure import name matches
const touchImport = g.match(/import \{ (\w+) \} from '\.\.\/util\/isTouchDevice'/);
const touchFn = touchImport?.[1] ?? 'isTouchDevice';
g = g.replace(/isTouchDevice\(/g, `${touchFn}(`);
g = g.replace(new RegExp(`import \\{ ${touchFn} \\} from`), `import { ${touchFn} } from`);

fs.writeFileSync(gamePath, g);

// Fix PauseMenu action: Game checks 'resume' — PauseMenu has 'resume'. Good.
// Fix main.ts
const mainPath = path.join(root, 'src/main.ts');
let main = fs.readFileSync(mainPath, 'utf8');
main = main.replace(
  /game\.onMenuRequest = \(\) => \{[\s\S]*?\};/,
  `game.onMenuRequest = () => {
    game?.setPaused(true);
    menu.show({ resumable: true });
  };`,
);

// Escape: open pause menu instead of pointer-lock exit / title
const esc = `window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (!game) return;
  if (game.chatOpen) {
    game.closeChat();
    return;
  }
  if (game.inventoryOpen) {
    game.closeInventory();
    return;
  }
  if (game.isPaused) {
    game.setPaused(false);
    return;
  }
  game.openPauseMenu();
});`;

if (main.includes("e.code !== 'Escape'")) {
  main = main.replace(/window\.addEventListener\('keydown', \(e\) => \{[\s\S]*?\n\}\);/, esc);
}
fs.writeFileSync(mainPath, main);

// CSS for pause menu + hide click overlay
const cssPath = path.join(root, 'src/style.css');
let css = fs.readFileSync(cssPath, 'utf8');
css = css.replace(
  /\.click-overlay \{[\s\S]*?\n\}\n\n\.click-overlay\[hidden\] \{[\s\S]*?\n\}/,
  `.click-overlay,
.click-overlay[hidden] {
  display: none !important;
}`,
);

if (!css.includes('.pause-menu')) {
  css += `

/* ---- Minecraft-style pause menu ---- */
.pause-menu {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  pointer-events: auto;
}

.pause-menu[hidden] {
  display: none !important;
}

.pause-menu__dim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
}

.pause-menu__panel {
  position: relative;
  z-index: 1;
  width: min(420px, calc(100vw - 2rem));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  padding: 1.25rem 1rem 1.35rem;
}

.pause-menu__title {
  font-family: var(--font-display, 'Silkscreen', monospace);
  font-size: 1.35rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 2px 2px 0 #000;
  margin: 0 0 0.5rem;
  letter-spacing: 0.04em;
}

.pause-menu__actions {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  width: 100%;
}

.pause-menu__btn {
  width: 100%;
  appearance: none;
  border: 2px solid #000;
  border-bottom-width: 4px;
  border-right-width: 4px;
  background: #8b8b8b;
  color: #fff;
  font-family: var(--font-display, 'Silkscreen', monospace);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 0.7rem 1rem;
  cursor: pointer;
  text-shadow: 1px 1px 0 #3f3f3f;
  box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.35), inset -2px -2px 0 rgba(0, 0, 0, 0.25);
}

.pause-menu__btn:hover {
  background: #a8a8a8;
}

.pause-menu__btn:active {
  border-bottom-width: 2px;
  border-right-width: 2px;
  transform: translate(1px, 1px);
}

.chat-root.menu-hidden {
  visibility: hidden;
  pointer-events: none;
}
`;
}

fs.writeFileSync(cssPath, css);
console.log('fixed');
