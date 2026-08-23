import fs from 'fs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => fs.readFileSync(`${root}/${p}`, 'utf8');
const write = (p, s) => fs.writeFileSync(`${root}/${p}`, s, 'utf8');

// --- ChatUi (clean UTF-8 Arabic/English) ---
write(
  'src/ui/ChatUi.ts',
  `const MAX_LEN = 160;
const MAX_VISIBLE = 40;
const ARABIC_RE = /[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;

export type ChatMessage = {
  id: string;
  name: string;
  text: string;
  self?: boolean;
  system?: boolean;
};

function sanitizeChat(text: string): string {
  return text
    .replace(/[\\u0000-\\u001F\\u007F]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEN);
}

function isRtl(text: string): boolean {
  return ARABIC_RE.test(text);
}

export class ChatUi {
  readonly root: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly formEl: HTMLFormElement;
  private readonly inputEl: HTMLInputElement;
  private open = false;
  private onSend: ((text: string) => void) | null = null;
  private onOpenChange: ((open: boolean) => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'chat-root';
    this.root.innerHTML = \`
      <div class="chat-log" role="log" aria-live="polite" aria-relevant="additions"></div>
      <form class="chat-form" hidden>
        <label class="chat-label" for="chat-input">Chat</label>
        <input
          id="chat-input"
          class="chat-input"
          type="text"
          maxlength="\${MAX_LEN}"
          autocomplete="off"
          autocorrect="on"
          autocapitalize="sentences"
          spellcheck="true"
          dir="auto"
          placeholder="Type… / اكتب هنا"
          enterkeyhint="send"
        />
        <button type="submit" class="chat-send" aria-label="Send">➤</button>
      </form>
    \`;

    this.logEl = this.root.querySelector('.chat-log')!;
    this.formEl = this.root.querySelector('.chat-form')!;
    this.inputEl = this.root.querySelector('.chat-input')!;

    this.formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    this.inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') {
        e.preventDefault();
        this.setOpen(false);
      }
    });

    this.inputEl.addEventListener('input', () => {
      this.inputEl.dir = isRtl(this.inputEl.value) ? 'rtl' : 'auto';
    });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) {
        return;
      }
      if (e.code === 'KeyT' || e.code === 'Enter') {
        if (this.open) return;
        e.preventDefault();
        this.setOpen(true);
      }
    });
  }

  onChatSend(fn: (text: string) => void): void {
    this.onSend = fn;
  }

  onToggle(fn: (open: boolean) => void): void {
    this.onOpenChange = fn;
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.root.classList.toggle('chat-open', open);
    this.formEl.hidden = !open;
    if (open) {
      this.inputEl.value = '';
      this.inputEl.dir = 'auto';
      requestAnimationFrame(() => this.inputEl.focus());
    } else {
      this.inputEl.blur();
    }
    this.onOpenChange?.(open);
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  push(msg: ChatMessage): void {
    const row = document.createElement('div');
    row.className = 'chat-row';
    if (msg.self) row.classList.add('chat-self');
    if (msg.system) row.classList.add('chat-system');

    const text = sanitizeChat(msg.text);
    if (!text && !msg.system) return;

    const rtl = isRtl(\`\${msg.name} \${text}\`);
    row.dir = rtl ? 'rtl' : 'ltr';

    if (msg.system) {
      row.textContent = text;
    } else {
      const nameEl = document.createElement('span');
      nameEl.className = 'chat-name';
      nameEl.textContent = msg.name || 'Wanderer';
      const body = document.createElement('span');
      body.className = 'chat-text';
      body.textContent = text;
      row.append(nameEl, document.createTextNode(rtl ? ' :' : ': '), body);
    }

    this.logEl.appendChild(row);
    while (this.logEl.children.length > MAX_VISIBLE) {
      this.logEl.firstElementChild?.remove();
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private submit(): void {
    const text = sanitizeChat(this.inputEl.value);
    if (!text) {
      this.setOpen(false);
      return;
    }
    this.onSend?.(text);
    this.inputEl.value = '';
    this.setOpen(false);
  }
}
`,
);

// --- Glass: remove transform (breaks backdrop-filter in Chromium) ---
{
  let css = read('src/style.css');
  css = css.replace(
    /\.inv-panel \{[\s\S]*?overflow: visible;\n  background: transparent;\n\}/,
    `.inv-panel {
  pointer-events: auto;
  position: absolute;
  /* Center without transform — transform ancestors break backdrop-filter blur */
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  margin: auto;
  width: min(720px, 94vw);
  height: fit-content;
  max-height: min(860px, 92vh);
  padding: 0;
  color: var(--ink);
  z-index: 1;
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    inset 0 -1px 0 rgba(0, 0, 0, 0.08),
    0 20px 56px rgba(0, 0, 0, 0.38);
  overflow: visible;
  background: transparent;
  transform: none;
}`,
  );

  css = css.replace(
    /html\.touch-device \.inv-panel \{[\s\S]*?padding: 0;\n\}/,
    `html.touch-device .inv-panel {
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  margin: auto;
  transform: none;
  width: min(calc(100vw - 1.25rem), 520px);
  height: fit-content;
  max-height: min(88dvh, 720px);
  border-radius: 16px;
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    0 20px 56px rgba(0, 0, 0, 0.4);
  padding: 0;
}`,
  );

  // Boost frost visibility
  css = css.replace(
    /\.inv-panel > \.glass-frost \{[\s\S]*?\}/,
    `.inv-panel > .glass-frost {
  background: rgba(14, 11, 26, 0.48);
  backdrop-filter: blur(32px) saturate(1.55);
  -webkit-backdrop-filter: blur(32px) saturate(1.55);
}`,
  );

  if (!css.includes('.chat-root')) {
    css += `

/* ---- Chat (Arabic + English) ---- */
.chat-root {
  position: fixed;
  left: max(0.75rem, env(safe-area-inset-left));
  bottom: max(4.5rem, calc(env(safe-area-inset-bottom) + 3.5rem));
  z-index: 45;
  width: min(420px, calc(100vw - 1.5rem));
  pointer-events: none;
  font-family: 'Noto Sans Arabic', 'Inter', system-ui, sans-serif;
}

.chat-log {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 11rem;
  overflow-y: auto;
  padding: 0.35rem 0.15rem;
  mask-image: linear-gradient(to bottom, transparent, #000 18%);
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 18%);
}

.chat-row {
  pointer-events: none;
  padding: 0.28rem 0.55rem;
  border-radius: 8px;
  background: rgba(10, 8, 18, 0.42);
  backdrop-filter: blur(10px) saturate(1.2);
  -webkit-backdrop-filter: blur(10px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--ink, #f5f0e8);
  font-size: 0.82rem;
  line-height: 1.35;
  word-break: break-word;
  overflow-wrap: anywhere;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.chat-name {
  font-weight: 700;
  color: var(--cyan, #5eead4);
  margin-inline-end: 0.15rem;
}

.chat-self .chat-name {
  color: var(--gold, #ffd166);
}

.chat-system {
  color: var(--muted, #9a92ae);
  font-style: italic;
  border-style: dashed;
}

.chat-form {
  pointer-events: auto;
  display: flex;
  gap: 0.35rem;
  margin-top: 0.4rem;
  padding: 0.4rem;
  border-radius: 12px;
  background: rgba(12, 10, 22, 0.55);
  backdrop-filter: blur(18px) saturate(1.35);
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.chat-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.chat-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--ink, #f5f0e8);
  font: inherit;
  font-size: 0.92rem;
  padding: 0.35rem 0.45rem;
}

.chat-input::placeholder {
  color: rgba(245, 240, 232, 0.45);
}

.chat-send {
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--ink, #f5f0e8);
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.chat-send:hover {
  background: rgba(255, 255, 255, 0.14);
}

html.touch-device .chat-root {
  bottom: calc(var(--mob-ui-bottom, 7rem) + 0.5rem);
  width: min(360px, calc(100vw - 1.25rem));
}

html.touch-device .chat-log {
  max-height: 8.5rem;
}
`;
  }

  write('src/style.css', css);
}

// --- Game.ts wire chat ---
{
  let g = read('src/game/Game.ts');
  if (!g.includes("from '../ui/ChatUi'")) {
    g = g.replace(
      "import { TouchControls } from '../ui/TouchControls';",
      "import { TouchControls } from '../ui/TouchControls';\nimport { ChatUi } from '../ui/ChatUi';",
    );
  }
  if (!g.includes('private chatUi')) {
    g = g.replace(
      'private touchControls: TouchControls | null = null;',
      "private touchControls: TouchControls | null = null;\n  private chatUi: ChatUi;\n  private playerName = 'Wanderer';",
    );
  }

  if (!g.includes('this.chatUi = new ChatUi()')) {
    g = g.replace(
      'host.appendChild(this.inventoryUi.root);',
      `host.appendChild(this.inventoryUi.root);

    this.chatUi = new ChatUi();
    host.appendChild(this.chatUi.root);
    this.chatUi.onToggle((open) => {
      const playing = !this.paused && !open && !this.inventoryUi.isOpen;
      this.player.setInputEnabled(playing);
      this.interaction.setEnabled(playing);
      this.touchControls?.setEnabled(playing);
      if (open && document.pointerLockElement) document.exitPointerLock();
    });
    this.chatUi.onChatSend((text) => {
      this.chatUi.push({
        id: 'local',
        name: this.playerName,
        text,
        self: true,
      });
      this.net?.sendChat(text);
    });`,
    );
  }

  if (!g.includes("onChat:")) {
    g = g.replace(
      /onReconnecting: \(\) => \{[\s\S]*?\},/,
      (m) =>
        `${m}
      onChat: (id, name, text) => {
        if (id === this.net?.playerId) return;
        this.chatUi.push({ id, name, text });
      },`,
    );
  }

  // Keep playerName in sync
  if (!g.includes('this.playerName =')) {
    g = g.replace(
      /applyPrefs\(([\s\S]*?)\{/,
      (m) => `${m}
    this.playerName = profile.name || 'Wanderer';`,
    );
    // also after loadProfile in constructor if present
    if (g.includes('loadProfile()') && !g.includes('this.playerName = loadProfile')) {
      g = g.replace(
        /this\.applyPrefs\(([^)]+)\);/,
        (m, args) => {
          return `const __profile = loadProfile();\n    this.playerName = __profile.name || 'Wanderer';\n    this.applyPrefs(${args.includes('loadProfile') ? args.replace('loadProfile()', '__profile') : args});`;
        },
      );
    }
  }

  // Pause closes chat
  if (!g.includes('this.chatUi.setOpen(false)')) {
    g = g.replace(
      /if \(paused\) \{\n\s*this\.inventoryUi\.setOpen\(false\);/,
      `if (paused) {
      this.inventoryUi.setOpen(false);
      this.chatUi.setOpen(false);`,
    );
  }

  // Touch chat button handler
  if (!g.includes('onChat:')) {
    g = g.replace(
      'onMenu: () => this.onMenuRequest?.(),',
      `onMenu: () => this.onMenuRequest?.(),
        onChat: () => this.chatUi.toggle(),`,
    );
  } else if (!g.includes('onChat: () => this.chatUi.toggle()')) {
    g = g.replace(
      'onMenu: () => this.onMenuRequest?.(),',
      `onMenu: () => this.onMenuRequest?.(),
        onChat: () => this.chatUi.toggle(),`,
    );
  }

  // Getters for main.ts
  if (!g.includes('get chatOpen')) {
    g = g.replace(
      /get inventoryOpen\(\): boolean \{\n\s*return this\.inventoryUi\.isOpen;\n\s*\}/,
      `get inventoryOpen(): boolean {
    return this.inventoryUi.isOpen;
  }

  get chatOpen(): boolean {
    return this.chatUi.isOpen;
  }

  closeChat(): void {
    this.chatUi.setOpen(false);
  }`,
    );
  }

  // Playing checks should include chat
  g = g.replace(
    /!this\.paused && !this\.inventoryUi\.isOpen/g,
    '!this.paused && !this.inventoryUi.isOpen && !this.chatUi.isOpen',
  );
  g = g.replace(
    /!this\.paused && !open/g,
    '!this.paused && !open && !this.chatUi.isOpen',
  );

  write('src/game/Game.ts', g);
}

// --- TouchControls chat button ---
{
  let t = read('src/ui/TouchControls.ts');
  if (!t.includes('onChat?:')) {
    t = t.replace('onMenu?: () => void;', 'onMenu?: () => void;\n  onChat?: () => void;');
  }
  if (!t.includes('data-action="chat"')) {
    t = t.replace(
      '<button type="button" class="touch-util-btn" data-action="menu" aria-label="Menu">☰</button>',
      `<button type="button" class="touch-util-btn" data-action="chat" aria-label="Chat">💬</button>
        <button type="button" class="touch-util-btn" data-action="menu" aria-label="Menu">☰</button>`,
    );
  }
  if (!t.includes("data-action=\"chat\"") || !t.includes('onChat')) {
    // bind click if not present
    if (!t.includes("querySelector('[data-action=\"chat\"]')")) {
      t = t.replace(
        /this\.root\.querySelector\('\[data-action="menu"\]'\)!\.addEventListener\('click',[\s\S]*?\}\);/,
        (m) =>
          `${m}

    this.root.querySelector('[data-action="chat"]')!.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      this.handlers.onChat?.();
    });`,
      );
    }
  }
  write('src/ui/TouchControls.ts', t);
}

// --- main.ts Escape closes chat ---
{
  let m = read('src/main.ts');
  if (!m.includes('game.chatOpen')) {
    m = m.replace(
      `if (game.inventoryOpen) {
    game.closeInventory();
    return;
  }`,
      `if (game.chatOpen) {
    game.closeChat();
    return;
  }
  if (game.inventoryOpen) {
    game.closeInventory();
    return;
  }`,
    );
  }
  write('src/main.ts', m);
}

// --- Server chat ---
{
  let s = read('server/index.ts');
  if (!s.includes("msg.t === 'chat'")) {
    s = s.replace(
      /if \(msg\.t === 'block'\) \{[\s\S]*?broadcastAll\(room, \{ t: 'block'[\s\S]*?\}\);?\n\s*\}/,
      (block) => `${block}

    if (msg.t === 'chat') {
      const text = String(msg.text ?? '')
        .replace(/[\\u0000-\\u001F\\u007F]/g, '')
        .replace(/\\s+/g, ' ')
        .trim()
        .slice(0, 160);
      if (!text) return;
      const now = Date.now();
      if (now - (player.lastChatAt ?? 0) < 400) return;
      player.lastChatAt = now;
      broadcastAll(room, {
        t: 'chat',
        id: playerId,
        name: player.name,
        text,
      });
    }`,
    );
    if (!s.includes('lastChatAt')) {
      s = s.replace(
        /lastBlockAt: number;\n\};/,
        'lastBlockAt: number;\n  lastChatAt: number;\n};',
      );
      s = s.replace(/lastBlockAt: 0,\n\s*\};/, 'lastBlockAt: 0,\n        lastChatAt: 0,\n      };');
    }
  }
  write('server/index.ts', s);
}

// --- Arabic font in index.html ---
{
  let h = read('index.html');
  if (!h.includes('Noto+Sans+Arabic')) {
    h = h.replace(
      'family=Inter:wght@400;500;600;700&display=swap',
      'family=Inter:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap',
    );
  }
  write('index.html', h);
}

console.log('patched ok');
`
