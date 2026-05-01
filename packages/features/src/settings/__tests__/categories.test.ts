import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_CATEGORY,
  findSettingsCategory,
  isSettingsCategoryId,
  SETTINGS_CATEGORIES,
  type SettingsCategoryId,
} from '../categories.ts';

describe('settings / categories', () => {
  it('exporta 14 categorias (12 da paridade V1 + support + backup)', () => {
    expect(SETTINGS_CATEGORIES).toHaveLength(14);
  });

  it('ids são únicos', () => {
    const ids = SETTINGS_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('DEFAULT_SETTINGS_CATEGORY aponta para uma categoria existente', () => {
    expect(findSettingsCategory(DEFAULT_SETTINGS_CATEGORY)).not.toBeNull();
  });

  it('isSettingsCategoryId aceita ids válidos', () => {
    for (const cat of SETTINGS_CATEGORIES) {
      expect(isSettingsCategoryId(cat.id)).toBe(true);
    }
  });

  it('isSettingsCategoryId rejeita ids inválidos', () => {
    expect(isSettingsCategoryId('unknown')).toBe(false);
    expect(isSettingsCategoryId('')).toBe(false);
  });

  it('pelo menos uma categoria é "ready" (contém implementação funcional)', () => {
    const ready = SETTINGS_CATEGORIES.filter((c) => c.status === 'ready');
    expect(ready.length).toBeGreaterThan(0);
  });

  it('findSettingsCategory retorna null para id inválido', () => {
    expect(findSettingsCategory('xxx')).toBeNull();
  });

  // Honesty gate: as categorias `usage` e `cloud-sync` são intencionalmente
  // marcadas `planned` até billing/R2 backend existirem. Se alguém flipar
  // pra `ready` sem implementar, o sidebar vai esconder o badge "Em breve"
  // e o usuário vai esperar feature funcional. Quebrar este teste exige
  // implementar a feature OU atualizar o test conscientemente.
  it('usage e cloud-sync ficam "planned" até backend existir', () => {
    const usage = findSettingsCategory('usage');
    const cloudSync = findSettingsCategory('cloud-sync');
    expect(usage?.status).toBe('planned');
    expect(cloudSync?.status).toBe('planned');
  });

  // Snapshot do split — falhar este teste é sinal de que algo mudou de
  // status sem update do roadmap / docs. Re-aprovar conscientemente.
  it('split ready/planned está estável', () => {
    const ready = SETTINGS_CATEGORIES.filter((c) => c.status === 'ready').map((c) => c.id);
    const planned = SETTINGS_CATEGORIES.filter((c) => c.status === 'planned').map((c) => c.id);
    expect(ready.sort()).toEqual([
      'agents',
      'app',
      'appearance',
      'backup',
      'input',
      'permissions',
      'preferences',
      'repair',
      'shortcuts',
      'support',
      'tags',
      'workspace',
    ] satisfies SettingsCategoryId[]);
    expect(planned.sort()).toEqual(['cloud-sync', 'usage'] satisfies SettingsCategoryId[]);
  });
});
