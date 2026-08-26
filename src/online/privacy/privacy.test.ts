import {
  assertPublishableMetadata,
  canSendToOnline,
  classifyOutboundPayload,
} from './classification';
import { evaluateOnlineGate } from './gate';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(classifyOutboundPayload({ kind: 'text' }) === 'LOCAL_ONLY', 'text defaults LOCAL_ONLY');
assert(classifyOutboundPayload({ kind: 'mod' }) === 'PRIVATE', 'mod defaults PRIVATE');
assert(
  classifyOutboundPayload({ kind: 'mod', userMarkedPublishable: true }) === 'PUBLISHABLE',
  'publishable mod',
);
assert(
  classifyOutboundPayload({ kind: 'text', containsLocalPaths: true }) === 'PRIVATE',
  'paths => PRIVATE',
);

const denyPrivate = canSendToOnline('PRIVATE', { onlineEnabled: true, userConsentOnline: true });
assert(!denyPrivate.allowed, 'PRIVATE never online');

const denyLocal = canSendToOnline('LOCAL_ONLY', { onlineEnabled: true, userConsentOnline: false });
assert(!denyLocal.allowed, 'LOCAL_ONLY needs consent');

const allowLocal = canSendToOnline('LOCAL_ONLY', { onlineEnabled: true, userConsentOnline: true });
assert(allowLocal.allowed, 'LOCAL_ONLY with consent');

const metaErrs = assertPublishableMetadata({ datasetPath: 'C:\\data' });
assert(metaErrs.length > 0, 'reject datasetPath');

const blocked = evaluateOnlineGate({
  kind: 'text',
  text: 'see C:\\Users\\me\\secret.png',
  onlineEnabled: true,
  allowOnlineForSafeLocal: true,
});
assert(!blocked.allowed, 'path in text blocked');

const ok = evaluateOnlineGate({
  kind: 'text',
  text: 'What biome is this?',
  onlineEnabled: true,
  allowOnlineForSafeLocal: true,
});
assert(ok.allowed, 'safe chat allowed');

console.log('online privacy tests: ok');
