import type { LegacyImportDecision, LegacyImportEntry, LegacyProject } from '@g4os/kernel/types';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useTranslate,
} from '@g4os/ui';
import { useState } from 'react';

export interface LegacyProjectsReviewProps {
  readonly projects: readonly LegacyProject[];
  readonly onApply: (entries: readonly LegacyImportEntry[]) => Promise<void>;
  readonly onCancel?: () => void;
  readonly isApplying?: boolean;
}

type DecisionMap = Record<string, LegacyImportDecision>;

function buildEntries(
  projects: readonly LegacyProject[],
  decisions: DecisionMap,
): readonly LegacyImportEntry[] {
  return projects.map((p) => ({
    path: p.path,
    name: p.name,
    slug: p.slug,
    ...(p.existingId ? { existingId: p.existingId } : {}),
    ...(p.description ? { description: p.description } : {}),
    decision: decisions[p.path] ?? 'skip',
  }));
}

export function LegacyProjectsReview({
  projects,
  onApply,
  onCancel,
  isApplying = false,
}: LegacyProjectsReviewProps) {
  const { t } = useTranslate();
  const [decisions, setDecisions] = useState<DecisionMap>(() =>
    Object.fromEntries(projects.map((p) => [p.path, 'import' as LegacyImportDecision])),
  );

  const handleDecision = (path: string, decision: LegacyImportDecision) => {
    setDecisions((prev) => ({ ...prev, [path]: decision }));
  };

  const handleApply = () => {
    void onApply(buildEntries(projects, decisions));
  };

  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('project.legacy.empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t('project.legacy.found', { count: String(projects.length) })}
      </p>

      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left font-medium">{t('project.legacy.col.name')}</th>
              <th className="px-4 py-2 text-left font-medium">{t('project.legacy.col.path')}</th>
              <th className="px-4 py-2 text-left font-medium">{t('project.legacy.col.action')}</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.path} className="border-b last:border-0">
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-muted-foreground">
                  {p.path}
                </td>
                <td className="px-4 py-2">
                  <Select
                    value={decisions[p.path] ?? 'import'}
                    onValueChange={(v) => handleDecision(p.path, v as LegacyImportDecision)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="import">{t('project.legacy.decision.import')}</SelectItem>
                      <SelectItem value="keep">{t('project.legacy.decision.keep')}</SelectItem>
                      <SelectItem value="skip">{t('project.legacy.decision.skip')}</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isApplying}>
            {t('project.legacy.cancel')}
          </Button>
        )}
        <Button onClick={handleApply} disabled={isApplying}>
          {isApplying ? t('project.legacy.applying') : t('project.legacy.apply')}
        </Button>
      </div>
    </div>
  );
}
