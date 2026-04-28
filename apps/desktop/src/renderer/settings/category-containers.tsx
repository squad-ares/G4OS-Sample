/**
 * Barrel — re-exporta cada container de categoria de settings. Cada
 * arquivo individual em `containers/` é mantido < 200 LOC para favorecer
 * legibilidade e parsing por IA. Veja CLAUDE.md "Limites e organização".
 */

export { AgentsCategoryContainer } from './containers/agents.tsx';
export { AppCategoryContainer } from './containers/app.tsx';
export { PermissionsCategoryContainer } from './containers/permissions.tsx';
export { PreferencesCategoryContainer } from './containers/preferences.tsx';
export { RepairCategoryContainer } from './containers/repair.tsx';
export { TagsCategoryContainer } from './containers/tags.tsx';
export { WorkspaceCategoryContainer } from './containers/workspace.tsx';
