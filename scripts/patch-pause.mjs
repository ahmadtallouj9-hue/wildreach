import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gamePath = path.join(root, 'src/game/Game.ts');
let g = fs.readFileSync(gamePath, 'utf8');

if (!g.includes("from '../ui/PauseMenu'")) {
  g = g.replace(
    "import { ChatUi } from '../ui/ChatUi';",
    "import { ChatUi } from '../ui/ChatUi';\nimport { PauseMenu } from '../ui/PauseMenu';",
  );
}

if (!g.includes('private pauseMenu')) {
  g = g.replace(
    'private chatUi: ChatUi;',
    'private chatUi: ChatUi;\n  private pauseMenu: PauseMenu;',
  );
}

if (!g.includes('ignorePointerUnlock')) {
  g = g.replace(
    'private paused = true;',
    'private paused = true;\n  private ignorePointerUnlock = false;',
  );
}

// Replace chat toggle to not fully pause world controls via shared sync + quiet unlock
g = g.replace(
  /this\.chatUi\.onToggle\(\(open\) => \{[\s\S]*?\}\);/,
  `this.chatUi.onToggle(() => {
      // Chat only steals typing focus — world keeps simulating (Minecraft-style).
      this.syncControlState();
      if (this.chatUi.isOpen) this.exitPointerLockQuiet();
    });`,
);

g = g.replace(
  /this\.inventoryUi\.onToggle\(\(open\) => \{[\s\S]*?\}\);/,
  `this.inventoryUi.onToggle((open) => {
      this.syncControlState();
      if (open) this.exitPointerLockQuiet();
    });`,
);

if (!g.includes('this.pauseMenu = new PauseMenu()')) {
  g = g.replace(
    /this\.chatUi\.onChatSend\(\(text\) => \{[\s\S]*?\}\);\n\n    this\.interaction/,
    (m) =>
      m.replace(
        'this.interaction',
        `this.pauseMenu = new PauseMenu();
    host.appendChild(this.pauseMenu.root);
    this.pauseMenu.on((action) => {
      if (action === 'resume') {
        this.setPaused(false);
        this.requestPointerLock();
        return;
      }
      this.onMenuRequest?.();
    });

    this.interaction`,
      ),
  );
}

// Touch menu opens pause instead of title
g = g.replace(
  'onMenu: () => this.onMenuRequest?.(),',
  'onMenu: () => this.setPaused(true),',
);

if (!g.includes('onPointerLockChange')) {
  g = g.replace(
    'window.addEventListener(\'resize\', () => this.onResize());',
    `document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    window.addEventListener('resize', () => this.onResize());`,
  );
}

// Replace setPaused block
g = g.replace(
  /setPaused\(paused: boolean\): void \{[\s\S]*?\n  \}\n\n  get isPaused/,
  `setPaused(paused: boolean): void {
    this.paused = paused;
    this.hud.setMenuOpen(paused);
    this.pauseMenu.setOpen(paused);
    this.inventoryUi.root.classList.toggle('menu-hidden', paused);
    this.chatUi.root.classList.toggle('menu-hidden', paused);
    if (paused) {
      this.inventoryUi.setOpen(false);
      this.chatUi.setOpen(false);
      this.exitPointerLockQuiet();
    }
    this.syncControlState();
  }

  get isPaused`,
);

if (!g.includes('openPauseMenu()')) {
  g = g.replace(
    /get isPaused\(\): boolean \{\n    return this\.paused;\n  \}/,
    `get isPaused(): boolean {
    return this.paused;
  }

  openPauseMenu(): void {
    if (this.paused) return;
    this.setPaused(true);
  }

  private syncControlState(): void {
    const canControl = !this.paused && !this.inventoryUi.isOpen && !this.chatUi.isOpen;
    this.player.setInputEnabled(canControl);
    this.interaction.setEnabled(canControl);
    this.touchControls?.setEnabled(canControl);
  }

  private exitPointerLockQuiet(): void {
    if (!document.pointerLockElement) return;
    this.ignorePointerUnlock = true;
    document.exitPointerLock();
    window.setTimeout(() => {
      this.ignorePointerUnlock = false;
    }, 0);
  }

  private requestPointerLock(): void {
    if (isTouchDevice() || this.paused || this.chatUi.isOpen || this.inventoryUi.isOpen) return;
    this.renderer.domElement.requestPointerLock?.();
  }

  private onPointerLockChange(): void {
    if (isTouchDevice()) return;
    if (document.pointerLockElement === this.renderer.domElement) return;
    if (this.ignorePointerUnlock) return;
    if (this.paused || this.chatUi.isOpen || this.inventoryUi.isOpen) return;
    this.setPaused(true);
  }`,
  );
}

if (!g.includes('this.pauseMenu.root.remove()')) {
  g = g.replace(
    'this.chatUi.root.remove();',
    'this.chatUi.root.remove();\n    this.pauseMenu.root.remove();',
  );
}

// Frame: world keeps running during chat; only local control stops
g = g.replace(
  /const playing = !this\.paused && !this\.inventoryUi\.isOpen && !this\.chatUi\.isOpen;/,
  `const worldLive = !this.paused && !this.inventoryUi.isOpen;
    const canControl = worldLive && !this.chatUi.isOpen;`,
);

// Replace uses of `playing` carefully in frame - read after write and fix remaining

fs.writeFileSync(gamePath, g);
console.log('Game.ts patched, length', g.length);
