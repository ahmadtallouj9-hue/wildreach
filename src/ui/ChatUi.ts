const MAX_LEN = 160;
const MAX_VISIBLE = 40;
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export type ChatMessage = {
  id: string;
  name: string;
  text: string;
  self?: boolean;
  system?: boolean;
};

function sanitizeChat(text: string): string {
  return text
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
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
    this.root.className = 'chat-root vy-chat';
    this.root.innerHTML = `
      <div class="vy-chat__log" role="log" aria-live="polite" aria-relevant="additions" hidden></div>
      <form class="vy-chat__form" hidden>
        <input
          id="vy-chat-input"
          class="vy-chat__input"
          type="text"
          maxlength="${MAX_LEN}"
          autocomplete="off"
          autocorrect="on"
          autocapitalize="sentences"
          spellcheck="true"
          dir="auto"
          aria-label="Chat"
          placeholder="Type… / اكتب هنا"
          enterkeyhint="send"
        />
        <button type="submit" class="vy-btn" aria-label="Send">Send</button>
      </form>
    `;

    this.logEl = this.root.querySelector('.vy-chat__log')!;
    this.formEl = this.root.querySelector('.vy-chat__form')!;
    this.inputEl = this.root.querySelector('.vy-chat__input')!;

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
    const text = sanitizeChat(msg.text);
    if (!text && !msg.system) return;

    const row = document.createElement('div');
    row.className = 'vy-chat__row';
    if (msg.self) row.classList.add('vy-chat__row--self');
    if (msg.system) row.classList.add('vy-chat__row--system');

    const rtl = isRtl(`${msg.name} ${text}`);
    row.dir = rtl ? 'rtl' : 'ltr';

    if (msg.system) {
      row.textContent = text;
    } else {
      const nameEl = document.createElement('span');
      nameEl.className = 'vy-chat__name';
      nameEl.textContent = msg.name || 'Wanderer';
      const body = document.createElement('span');
      body.className = 'vy-chat__text';
      body.textContent = text;
      row.append(nameEl, document.createTextNode(rtl ? ' :' : ': '), body);
    }

    this.logEl.hidden = false;
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
