import './style.css';
import './ui/tokens.css';
import './ui/vythera-ui.css';
import './ui/game-ui.css';
import './ui/modelEditor.css';
import './vythera_ai/ui/vythera-ai-studio.css';
import { Game } from './game/Game';
import { MainMenu } from './ui/MainMenu';
import { LoadingScreen } from './ui/LoadingScreen';
import { isTouchDevice } from './util/isTouchDevice';
import { applyShareParams, parseShareFromUrl } from './ui/shareUrl';
import { saveLastWorld } from './ui/worldNames';
import { saveWorldSettings, loadWorldSettings } from './ui/worldSettings';
import { SocialClient } from './net/SocialClient';
import { mpUrl } from './net/protocol';
import { loadProfile } from './ui/prefs';

if (isTouchDevice()) {
  document.documentElement.classList.add('touch-device');
}

const appEl = document.querySelector<HTMLDivElement>('#app');
if (!appEl) throw new Error('#app missing');
const app: HTMLElement = appEl;

app.innerHTML = '';

const social = new SocialClient(mpUrl());
social.connect(loadProfile());

const menu = new MainMenu(social);
app.appendChild(menu.root);

const loading = new LoadingScreen();
app.appendChild(loading.root);

let game: Game | null = null;

function startWorld(seed: string): void {
  menu.hide();
  loading.show('Preparing world…');
  requestAnimationFrame(() => {
    loading.setPhase('Generating terrain…');
    requestAnimationFrame(() => {
      loading.setPhase('Building biome…');
      const g = ensureGame(seed);
      loading.setPhase('Initializing local systems…');
      // Prefs may have been emitted before Game existed (skin upload on title).
      menu.pushPrefs();
      g.setPaused(false);
      loading.setPhase('Creating vegetation…');
      requestAnimationFrame(() => {
        loading.complete();
        window.setTimeout(() => loading.hide(), 180);
      });
    });
  });
}

function ensureGame(seed: string): Game {
  if (game && game.seed === seed) return game;
  if (game) game.dispose();
  game = new Game(app, seed);
  game.setSocial(social);
  game.onMenuRequest = (panel) => {
    game?.returnToTitle();
    menu.show({ resumable: true });
    if (panel === 'settings') menu.openPanel('settings');
    else if (panel === 'multiplayer') menu.openPanel('multiplayer');
  };
  app.appendChild(menu.root);
  game.start();
  return game;
}

menu.on((action) => {
  if (action.type === 'prefs') {
    game?.applyPrefs(action.profile, action.settings, action.skinPixels);
    social.updateProfile(action.profile);
    return;
  }
  if (action.type === 'edit-hud') {
    if (!game) return;
    menu.hide();
    game.beginHudEdit();
    return;
  }
  if (action.type === 'play') {
    startWorld(action.seed);
  } else if (action.type === 'resume' && game) {
    game.setPaused(false);
    menu.hide();
  }
});

social.on({
  onJoinInvite: (invite) => {
    saveWorldSettings(invite.seed, {
      ...loadWorldSettings(invite.seed),
      ...invite.world,
    });
    saveLastWorld(invite.seed);
    if (game) {
      game.dispose();
      game = null;
    }
    startWorld(invite.seed);
  },
  onJoinRequest: () => {
    game?.showJoinRequestToast();
  },
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (!game) return;
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
});

const shared = parseShareFromUrl();
if (shared) {
  applyShareParams(shared);
  saveLastWorld(shared.seed);
}
menu.show();
