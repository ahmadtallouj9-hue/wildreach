/**
 * VYTHERA ENGINE — Core
 *
 * Game-agnostic primitives every layer builds on: logging, events, time,
 * profiling. Engine code must never import game code.
 */

export { Logger, createLogger, LogLevels } from './Logger';
export type { LogLevel, LogEntry, LogSink } from './Logger';
export { EventBus } from './EventBus';
export { FixedTimestep } from './FixedTimestep';
export { Profiler, profiler } from './Profiler';
export type { ProfilerStats } from './Profiler';
export {
  QUALITY_TIER_CONFIGS,
  QUALITY_TIERS,
  detectDefaultQualityTier,
  getTierConfig,
  isQualityTier,
  nextTierDown,
} from './QualityConfig';
export type { QualityConfig, QualityTier, ShadowQuality, WaterShading } from './QualityConfig';
