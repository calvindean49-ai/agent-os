import type { ToolId } from '../../shared/types.ts';
import { claude } from './claude.ts';
import { codex } from './codex.ts';
import type { Adapter } from './types.ts';

export const ADAPTERS: Readonly<Record<ToolId, Adapter>> = { claude, codex };
export type { Adapter } from './types.ts';
