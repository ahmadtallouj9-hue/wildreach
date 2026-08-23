import './style.css';
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
  if (!game || game.isPaused) return;
  if (game.inventoryOpen) {
    game.closeInventory();
    return;
  }
  if (document.pointerLockElement) {
    document.exitPointerLock();
    return;
  }
  game.setPaused(true);
  menu.show({ resumable: true });
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
