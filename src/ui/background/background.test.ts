import { AnimationClock, wrapOffset } from './AnimationClock.js';
import {
  DEFAULT_BG_PREFS,
  normalizeBgPrefs,
  resolveBgLayers,
  resolveBgMotion,
} from './backgroundPrefs.js';
import { phaseFromTime } from './pixelPalette.js';
import { PixelBackgroundEngine } from './PixelBackgroundEngine.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function ensureMinimalDom(): void {
  if (typeof document !== 'undefined') return;
  const mockCtx = {
    imageSmoothingEnabled: true,
    fillStyle: '',
    fillRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  const el = (tag: string) => ({
    tagName: tag.toUpperCase(),
    width: 0,
    height: 0,
    className: '',
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    setAttribute: () => {},
    appendChild: () => {},
    remove: () => {},
    getContext: () => (tag === 'canvas' ? mockCtx : null),
    classList: { add: () => {} },
  });
  (globalThis as { document?: Document }).document = {
    createElement: (tag: string) => el(tag),
    body: el('body'),
  } as unknown as Document;
}

assert(wrapOffset(-5, 10) === 5, 'wrapOffset negative');
assert(wrapOffset(12, 10) === 2, 'wrapOffset positive');
assert(wrapOffset(10, 10) === 0, 'wrapOffset exact span');

const clock = new AnimationClock();
clock.setProfile({ motion: 1, running: true });
clock.start();
const dt1 = clock.tick(1000);
assert(dt1 > 0, 'clock advances when running');
clock.stop();
const before = clock.time.value;
clock.tick(2000);
assert(clock.time.value === before, 'clock pauses when stopped');

const staticPrefs = normalizeBgPrefs({ mode: 'static', animation: 'high' });
assert(staticPrefs.animation === 'off', 'static mode forces animation off');

const perfPrefs = normalizeBgPrefs({ mode: 'performance', quality: 'ultra', animation: 'high' });
assert(perfPrefs.quality === 'medium', 'performance caps quality');
assert(perfPrefs.animation === 'low', 'performance caps animation');

const offLayers = resolveBgLayers(normalizeBgPrefs({ animation: 'off' }), false);
assert(!offLayers.animate && !offLayers.clouds, 'animation off disables clouds');

const noCloud = resolveBgLayers(normalizeBgPrefs({ cloudMotion: false }), false);
assert(!noCloud.clouds && noCloud.sky, 'cloud toggle');

const lowQ = resolveBgLayers(normalizeBgPrefs({ quality: 'low' }), false);
assert(!lowQ.vegetation && !lowQ.water, 'low quality skips veg/water');

const reducedMotion = resolveBgMotion(DEFAULT_BG_PREFS, true);
const normalMotion = resolveBgMotion(DEFAULT_BG_PREFS, false);
assert(reducedMotion.cloudSpeed < normalMotion.cloudSpeed, 'reduced motion slows clouds');

assert(phaseFromTime(0) === 'morning', 'phase morning at t=0');
assert(phaseFromTime(200) === 'day', 'phase day mid-cycle');

ensureMinimalDom();
const host = document.createElement('div');
document.body.appendChild(host);
const engine = new PixelBackgroundEngine(DEFAULT_BG_PREFS);
const mounted = engine.mount(host);
assert(mounted, 'engine mounts with canvas');
const state = engine.getState();
assert(state.layers.sky && state.layers.farEnv, 'core layers active');
engine.setPrefs(normalizeBgPrefs({ animation: 'off' }));
assert(!engine.getState().layers.animate, 'prefs disable animation');
engine.renderStep(12);
engine.setVisible(false);
engine.stop();
engine.dispose();
host.remove();

console.log('background tests: ok');
