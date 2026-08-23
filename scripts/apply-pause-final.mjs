import fs from 'fs';

let main = fs.readFileSync('src/main.ts', 'utf8');
const esc = `window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (!game) return;
  // Title screen owns Escape while visible
  if (!menu.root.hidden) return;
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

if (!main.includes('openPauseMenu')) {
  main = main.replace(/window\.addEventListener\('keydown', \(e\) => \{[\s\S]*?\n\}\);/, esc);
  fs.writeFileSync('src/main.ts', main);
  console.log('main patched');
} else {
  console.log('main already patched');
}

// Align Game chat hooks to ChatUi API
let game = fs.readFileSync('src/game/Game.ts', 'utf8');
const chat = fs.readFileSync('src/ui/ChatUi.ts', 'utf8');
const sendHook = chat.includes('onChatSend(') ? 'onChatSend' : chat.includes('onSend(') ? 'onSend' : 'onChatSend';
const toggleHook = chat.includes('onToggle(') ? 'onToggle' : 'onToggle';
game = game.replace(/this\.chatUi\.on(?:ChatSend|Send)\(/g, `this.chatUi.${sendHook}(`);
game = game.replace(/this\.chatUi\.on(?:Toggle|OpenChange)\(/g, `this.chatUi.${toggleHook}(`);
// openPauseMenu alias
if (!game.includes('openPauseMenu()') && game.includes('openPauseMenu()')) {
  /* already */
}
if (game.includes('openPauseMenu()') && !game.includes('openPauseMenu():')) {
  game = game.replace(
    /openPauseMenu\(\): void \{/,
    'openPauseMenu(): void {',
  );
}
if (!game.includes('openPauseMenu():') && game.includes('openPauseMenu():')) {
  // noop
}
// Ensure method name matches main
if (game.includes('openPauseMenu():') && main.includes('openPauseMenu()')) {
  // good
} else if (game.includes('openPauseMenu():') && main.includes('openPauseMenu()')) {
  main = main.replace('openPauseMenu()', 'openPauseMenu()');
}
fs.writeFileSync('src/game/Game.ts', game);

let css = fs.readFileSync('src/style.css', 'utf8');
css = css.replace(/\.click-overlay \{[\s\S]*?\n\}/, '.click-overlay {\n  display: none !important;\n}');
css = css.replace(
  /\.click-overlay\[hidden\] \{[\s\S]*?\n\}/,
  '.click-overlay[hidden] {\n  display: none !important;\n}',
);
if (!css.includes('.pause-menu {')) {
  css += `

/* ---- Minecraft-style pause menu ---- */
.pause-menu {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
}
.pause-menu[hidden] { display: none !important; }
.pause-menu__dim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.58);
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
  font-family: var(--font-display, Silkscreen, monospace);
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
  font-family: var(--font-display, Silkscreen, monospace);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 0.7rem 1rem;
  cursor: pointer;
  text-shadow: 1px 1px 0 #3f3f3f;
  box-shadow: inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.25);
}
.pause-menu__btn:hover { background: #a8a8a8; }
.pause-menu__btn:active {
  border-bottom-width: 2px;
  border-right-width: 2px;
  transform: translate(1px, 1px);
}
.chat-root.menu-hidden { visibility: hidden; pointer-events: none; }
`;
}
fs.writeFileSync('src/style.css', css);
console.log('done');
