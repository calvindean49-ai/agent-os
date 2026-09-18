import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Probe } from '../shared/types.ts';
import { ADAPTERS } from './adapters/index.ts';
import type { Config } from './config.ts';
import { gitVersion, isRepo } from './git.ts';
import { isAlive, startToken } from './procstart.ts';
import { probeClaudeLogin } from './status.ts';

export const UP_FILE = '.agent-os/up.json';
export const UP_LOG_DIR = '.agent-os/up';

export interface ServiceState {
  readonly pid: number;
  readonly processStartedAt: string | null;
  readonly logPath: string;
}

export interface UpState {
  readonly startedAt: string;
  readonly services: Readonly<Partial<Record<'runner' | 'desk', ServiceState>>>;
}

export interface PreflightDeps {
  readonly git?: () => Probe;
  readonly claudeLogin?: () => Probe;
  readonly tools?: () => readonly string[];
}

export function preflight(root: string, config: Config, deps: PreflightDeps = {}): readonly string[] {
  const errors: string[] = [];
  const git = (deps.git ?? gitVersion)();
  if (!git.ok) {
    const repair = /xcode|licen[cs]e/i.test(git.detail) ? ' Run: sudo xcodebuild -license accept' : '';
    errors.push(`git: ${git.detail || 'probe failed'}.${repair}`);
  }
  const toolErrors = (deps.tools ?? (() => Object.values(ADAPTERS).flatMap((adapter) => {
    const found = adapter.detect();
    return found.available ? [] : [`${adapter.label}: ${found.why}`];
  })))();
  errors.push(...toolErrors);
  if (!toolErrors.some((error) => error.startsWith('Claude Code:'))) {
    const login = (deps.claudeLogin ?? probeClaudeLogin)();
    if (!login.ok) errors.push(`Claude Code: ${login.detail}`);
  }
  if (config.brain === null) errors.push('Brain: not configured. Run npm run config:init -- --brain /absolute/path');
  else if (!isRepo(config.brain)) errors.push(`Brain: ${config.brain} is not a git repository`);
  return errors;
}

export function readUpState(root: string): UpState | null {
  const path = join(root, UP_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as UpState;
  } catch {
    return null;
  }
}

export function writeUpState(root: string, state: UpState): void {
  const path = join(root, UP_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

export function clearUpState(root: string): void {
  const path = join(root, UP_FILE);
  if (existsSync(path)) unlinkSync(path);
}

/** Destructive callers require an exact start-token match; ambiguity means do not signal. */
export function serviceMatches(service: ServiceState, alive = isAlive, token = startToken): boolean {
  if (!alive(service.pid) || service.processStartedAt === null) return false;
  const current = token(service.pid);
  return current !== null && current === service.processStartedAt;
}
