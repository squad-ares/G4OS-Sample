import type { Workspace } from '@g4os/kernel/types';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useTranslate,
} from '@g4os/ui';
import { useEffect, useId, useState } from 'react';
import { type ValidationIssue, validateWorkspaceDefaults } from '../logic/validate.ts';
import { PERMISSION_PRESETS, WORKSPACE_COLORS } from '../types.ts';

export interface WorkspaceSettingsPatch {
  readonly name: string;
  readonly metadataTheme?: string;
  readonly defaults: {
    readonly workingDirectory?: string;
    readonly projectsRootPath?: string;
    readonly permissionMode: Workspace['defaults']['permissionMode'];
    readonly llmConnectionSlug?: string;
  };
}

export interface WorkspaceSettingsPanelProps {
  readonly workspace: Workspace;
  readonly saving?: boolean;
  readonly onSave: (patch: WorkspaceSettingsPatch) => Promise<void>;
  readonly onReset?: () => void;
  readonly onDelete?: () => void;
}

export function WorkspaceSettingsPanel({
  workspace,
  saving = false,
  onSave,
  onReset,
  onDelete,
}: WorkspaceSettingsPanelProps) {
  const { t } = useTranslate();
  const [draft, setDraft] = useState<WorkspaceSettingsPatch>(() => buildInitialPatch(workspace));
  const [issues, setIssues] = useState<readonly ValidationIssue[]>([]);

  useEffect(() => {
    setDraft(buildInitialPatch(workspace));
  }, [workspace]);

  const handleSave = async () => {
    const newIssues = validateWorkspaceDefaults({
      name: draft.name,
      defaults: draft.defaults,
    });
    setIssues(newIssues);
    if (newIssues.length > 0) return;
    await onSave(draft);
  };

  const nameId = useId();
  const workingDirId = useId();
  const projectsRootId = useId();

  return (
    <Tabs defaultValue="general" className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="general">{t('workspace.settings.tab.general')}</TabsTrigger>
        <TabsTrigger value="paths">{t('workspace.settings.tab.paths')}</TabsTrigger>
        <TabsTrigger value="permissions">{t('workspace.settings.tab.permissions')}</TabsTrigger>
        <TabsTrigger value="advanced">{t('workspace.settings.tab.advanced')}</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={nameId}>{t('workspace.settings.general.name')}</Label>
          <Input
            id={nameId}
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
          <IssueMessage issues={issues} field="name" />
        </div>
        <div className="space-y-2">
          <Label>{t('workspace.settings.general.color')}</Label>
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {WORKSPACE_COLORS.map((color) => {
              const isSelected = draft.metadataTheme === color.hex;
              return (
                // biome-ignore lint/a11y/useSemanticElements: (reason: visual color picker; <button> with explicit role provides better styling than hidden <input type="radio">)
                <button
                  key={color.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setDraft((prev) => ({ ...prev, metadataTheme: color.hex }))}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-accent bg-accent/10 text-foreground'
                      : 'border-foreground/12 text-foreground/70 hover:border-foreground/30'
                  }`}
                >
                  <span
                    aria-hidden={true}
                    className="size-3 rounded-full"
                    style={{ backgroundColor: color.hex }}
                  />
                  {t(color.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="paths" className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={workingDirId}>{t('workspace.settings.paths.workingDir')}</Label>
          <Input
            id={workingDirId}
            value={draft.defaults.workingDirectory ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((prev) => {
                const { workingDirectory: _omit, ...restDefaults } = prev.defaults;
                return {
                  ...prev,
                  defaults: { ...restDefaults, ...(value ? { workingDirectory: value } : {}) },
                };
              });
            }}
            placeholder={t('workspace.settings.paths.workingDirPlaceholder')}
          />
          <p className="text-xs text-muted-foreground">
            {t('workspace.settings.paths.workingDirHint')}
          </p>
          <IssueMessage issues={issues} field="workingDirectory" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={projectsRootId}>{t('workspace.settings.paths.projectsRoot')}</Label>
          <Input
            id={projectsRootId}
            value={draft.defaults.projectsRootPath ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((prev) => {
                const { projectsRootPath: _omit, ...restDefaults } = prev.defaults;
                return {
                  ...prev,
                  defaults: { ...restDefaults, ...(value ? { projectsRootPath: value } : {}) },
                };
              });
            }}
            placeholder={t('workspace.settings.paths.projectsRootPlaceholder')}
          />
          <IssueMessage issues={issues} field="projectsRootPath" />
        </div>
      </TabsContent>

      <TabsContent value="permissions" className="space-y-5">
        <div className="space-y-2">
          <Label>{t('workspace.settings.permissions.preset')}</Label>
          <Select
            value={draft.defaults.permissionMode}
            onValueChange={(value: string) =>
              setDraft((prev) => ({
                ...prev,
                defaults: {
                  ...prev.defaults,
                  permissionMode: value as Workspace['defaults']['permissionMode'],
                },
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERMISSION_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.mode}>
                  {t(preset.labelKey as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PermissionDescriptions mode={draft.defaults.permissionMode} />
        </div>
      </TabsContent>

      <TabsContent value="advanced" className="space-y-5">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <h3 className="text-sm font-semibold text-destructive">
            {t('workspace.settings.advanced.dangerTitle')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('workspace.settings.advanced.dangerDescription')}
          </p>
          {onDelete ? (
            <Button variant="destructive" size="sm" onClick={onDelete} className="mt-3">
              {t('workspace.settings.advanced.delete')}
            </Button>
          ) : null}
        </div>
      </TabsContent>

      <footer className="flex justify-between border-t border-foreground/6 pt-4">
        {onReset ? (
          <Button variant="ghost" onClick={onReset} disabled={saving}>
            {t('workspace.settings.reset')}
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? t('workspace.settings.saving') : t('workspace.settings.save')}
        </Button>
      </footer>
    </Tabs>
  );
}

function PermissionDescriptions({
  mode,
}: {
  readonly mode: Workspace['defaults']['permissionMode'];
}) {
  const { t } = useTranslate();
  const preset = PERMISSION_PRESETS.find((p) => p.mode === mode);
  if (!preset) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {t(preset.descriptionKey as Parameters<typeof t>[0])}
    </p>
  );
}

function IssueMessage({
  issues,
  field,
}: {
  readonly issues: readonly ValidationIssue[];
  readonly field: ValidationIssue['field'];
}) {
  const { t } = useTranslate();
  const issue = issues.find((i) => i.field === field);
  if (!issue) return null;
  return (
    <p className="text-xs text-destructive">{t(issue.messageKey as Parameters<typeof t>[0])}</p>
  );
}

function buildInitialPatch(workspace: Workspace): WorkspaceSettingsPatch {
  return {
    name: workspace.name,
    ...(workspace.metadata.theme === undefined ? {} : { metadataTheme: workspace.metadata.theme }),
    defaults: {
      permissionMode: workspace.defaults.permissionMode,
      ...(workspace.defaults.workingDirectory === undefined
        ? {}
        : { workingDirectory: workspace.defaults.workingDirectory }),
      ...(workspace.defaults.projectsRootPath === undefined
        ? {}
        : { projectsRootPath: workspace.defaults.projectsRootPath }),
      ...(workspace.defaults.llmConnectionSlug === undefined
        ? {}
        : { llmConnectionSlug: workspace.defaults.llmConnectionSlug }),
    },
  };
}
