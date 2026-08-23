import fs from 'fs';

// Fix main Escape → Minecraft pause menu
fs.writeFileSync(
  'src/main.ts',
  `import './style.css';
import { Game } from './game/Game';
import { MainMenu } from './ui/MainMenu';
import { isTouchDevice } from './util/isTouchDevice';
import { applyShareParams, parseShareFromUrl } from './ui/shareUrl';
import { saveLastWorld } from './ui/worldNames';

if (isTouchDevice()) {
  document.documentElement.classList.add('touch-device');
}

const appEl = document.querySelector<HTMLDivElement>('#app');
if (!appEl) throw new Error('#app missing');
const app: HTMLElement = appEl;

app.innerHTML = '';

const menu = new MainMenu();
app.appendChild(menu.root);

let game: Game | null = null;

function ensureGame(seed: string): Game {
  if (game && game.seed === seed) return game;
  if (game) game.dispose();
  game = new Game(app, seed);
  game.onMenuRequest = () => {
    // Quit to title from pause menu
    game?.setPaused(true);
    menu.show({ resumable: true });
  };
  app.appendChild(menu.root);
  game.start();
  return game;
}

menu.on((action) => {
  if (action.type === 'prefs') {
    game?.applyPrefs(action.profile, action.settings, action.skinPixels);
    return;
  }
  if (action.type === 'play') {
    menu.hide();
    const seed = action.seed;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ensureGame(seed).setPaused(false);
      });
    });
  } else if (action.type === 'resume' && game) {
    game.setPaused(false);
    menu.hide();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (!game) return;
  // Don't steal Escape from title menu
  if (!menu.root.hidden && game.isPaused && menu.root.classList.contains('menu-visible')) {
    return;
  }
  if (game.chatOpen) {
    game.closeChat();
    return;
  }
  if (game.inventoryOpen) {
    game.closeInventory();
    return;
  }
  if (game.isPaused) {
    // Escape on pause menu = back to game (Minecraft)
    if (!menu.root.hidden) return;
    game.setPaused(false);
    return;
  }
  game.openPauseMenu();
});

const shared = parseShareFromUrl();
if (shared) {
  applyShareParams(shared);
  saveLastWorld(shared.seed);
  if (shared.autoJoin) {
    menu.hide();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ensureGame(shared.seed).setPaused(false);
      });
    });
  } else {
    menu.show();
  }
} else {
  menu.show();
}
`,
);

// CSS: hide click overlay + pause menu styles
let css = fs.readFileSync('src/style.css', 'utf8');
css = css.replace(
  /\.click-overlay \{[\s\S]*?\n\}\n\n\.click-overlay\[hidden\] \{[\s\S]*?\n\}/,
  `.click-overlay,
.click-overlay[hidden] {
  display: none !important;
}`,
);
// Also kill .click-card etc visibility if overlay somehow appears
if (!css.includes('display: none !important;\n}\n\n.click-card')) {
  css = css.replace(
    /\.click-card \{/,
    `.click-overlay, .click-card, .click-kicker, .click-title, .click-sub {\n  display: none !important;\n}\n\n.click-card-unused {`,
  );
}

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

.pause-menu[hidden] {
  display: none !important;
}

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
fs.writeFileSync('src/style.css', css);

// Align ChatUi method names if Game expects onToggle but file has onToggle
let chat = fs.readFileSync('src/ui/ChatUi.ts', 'utf8');
if (chat.includes('onToggle(') && !chat.includes('onToggle(')) {
  chat = chat.replace('onToggle(', 'onToggle(');
}
// Game calls onToggle — ensure alias
if (chat.includes('onToggle(') && !chat.includes('onToggle(fn')) {
  // already onToggle
}
if (!chat.includes('onToggle(') && chat.includes('onOpenChange')) {
  chat = chat.replace(
    /onOpenChange\(fn/,
    'onToggle(fn',
  );
}
fs.writeFileSync('src/ui/ChatUi.ts', chat);

// PauseMenu: also accept 'resume' from older wiring — already resume
// Ensure Quit to title hides pause under menu: when onMenuRequest, MainMenu covers it

console.log('main + css updated');
