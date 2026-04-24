import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_CATEGORY,
  findSettingsCategory,
  isSettingsCategoryId,
  SETTINGS_CATEGORIES,
} from '../categories.ts';

describe('settings / categories', () => {
  it('exporta 12 categorias (paridade V1)', () => {
    expect(SETTINGS_CATEGORIES).toHaveLength(12);
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
});
