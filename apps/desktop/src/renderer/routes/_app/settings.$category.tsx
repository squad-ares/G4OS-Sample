import {
  AppearanceCategory,
  CategoryPlaceholder,
  CloudSyncCategory,
  DEFAULT_SETTINGS_CATEGORY,
  findSettingsCategory,
  isSettingsCategoryId,
  type SettingsCategory,
  UsageCategory,
} from '@g4os/features/settings';
import { ShortcutsList } from '@g4os/features/shell';
import {
  PageScaffold,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPanel,
  useTranslate,
} from '@g4os/ui';
import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  AgentsCategoryContainer,
  AppCategoryContainer,
  BackupCategoryContainer,
  PermissionsCategoryContainer,
  PreferencesCategoryContainer,
  RepairCategoryContainer,
  SupportCategoryContainer,
  TagsCategoryContainer,
  WorkspaceCategoryContainer,
} from '../../settings/category-containers.tsx';

function SettingsCategoryPage() {
  const { t } = useTranslate();
  const { category } = Route.useParams();
  const active = findSettingsCategory(category);
  if (!active) return null;

  return (
    <PageScaffold
      eyebrow={t('page.settings.badge')}
      title={t(active.labelKey)}
      description={t(active.descriptionKey)}
    >
      <CategoryContent category={active} />
    </PageScaffold>
  );
}

function CategoryContent({ category }: { readonly category: SettingsCategory }) {
  switch (category.id) {
    case 'app':
      return <AppCategoryContainer />;
    case 'agents':
      return <AgentsCategoryContainer />;
    case 'appearance':
      return <AppearanceCategory />;
    case 'workspace':
      return <WorkspaceCategoryContainer />;
    case 'tags':
      return <TagsCategoryContainer />;
    case 'preferences':
      return <PreferencesCategoryContainer />;
    case 'repair':
      return <RepairCategoryContainer />;
    case 'input':
      return <InputCategory />;
    case 'shortcuts':
      return <ShortcutsCategory />;
    case 'usage':
      return <UsageCategory />;
    case 'permissions':
      return <PermissionsCategoryContainer />;
    case 'cloud-sync':
      return <CloudSyncCategory />;
    case 'backup':
      return <BackupCategoryContainer />;
    case 'support':
      return <SupportCategoryContainer />;
    default:
      return <CategoryPlaceholder category={category} />;
  }
}

function InputCategory() {
  const { locale, setLocale, t } = useTranslate();
  return (
    <StatusPanel
      title={t('page.settings.localeTitle')}
      description={t('page.settings.localeDescription')}
      badge={t('page.settings.localeBadge')}
    >
      <div className="max-w-xs">
        <Select value={locale} onValueChange={(value) => setLocale(value as typeof locale)}>
          <SelectTrigger aria-label={t('page.settings.localeAriaLabel')}>
            <SelectValue placeholder={t('page.settings.localePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pt-BR">{t('locale.pt-BR')}</SelectItem>
            <SelectItem value="en-US">{t('locale.en-US')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </StatusPanel>
  );
}

function ShortcutsCategory() {
  const { t } = useTranslate();
  return (
    <StatusPanel
      title={t('page.settings.shortcutsTitle')}
      description={t('page.settings.shortcutsDescription')}
      tone="warning"
    >
      <ShortcutsList />
    </StatusPanel>
  );
}

export const Route = createFileRoute('/_app/settings/$category')({
  beforeLoad: ({ params }) => {
    if (!isSettingsCategoryId(params.category)) {
      throw redirect({
        to: '/settings/$category',
        params: { category: DEFAULT_SETTINGS_CATEGORY },
      });
    }
  },
  component: SettingsCategoryPage,
});
