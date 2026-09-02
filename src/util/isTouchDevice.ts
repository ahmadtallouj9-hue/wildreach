/**
 * True for phones/tablets that need on-screen controls.
 * Implementation lives in the engine platform layer; this module stays as
 * the stable import path for existing game code.
 */
export { isTouchDevice } from '../engine/platform/device';
