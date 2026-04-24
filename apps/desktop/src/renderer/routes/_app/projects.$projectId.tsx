import { ProjectFilesPanel, ProjectTaskBoard } from '@g4os/features/projects';
import { useActiveWorkspaceId } from '@g4os/features/workspaces';
import type { Session } from '@g4os/kernel/types';
import {
  Button,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useTranslate,
} from '@g4os/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useProjectDetail } from '../../projects/use-project-detail.ts';

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { t } = useTranslate();
  const navigate = useNavigate();
  const activeWorkspaceId = useActiveWorkspaceId();
  const page = useProjectDetail(projectId);

  const [fileContent, setFileContent] = useState<string | null>(null);
  const [openedFile, setOpenedFile] = useState<string | null>(null);

  async function handleOpenFile(relativePath: string): Promise<void> {
    try {
      const content = await page.readFile(relativePath);
      setOpenedFile(relativePath);
      setFileContent(content);
    } catch {
      setOpenedFile(null);
      setFileContent(null);
    }
  }

  function handleCloseFile(): void {
    setOpenedFile(null);
    setFileContent(null);
  }

  if (page.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  if (!page.project) {
    return <div className="p-6 text-sm text-muted-foreground">{t('project.detail.notFound')}</div>;
  }

  return (
    <div className="flex h-full flex-col px-4 py-4">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{page.project.name}</h1>
          {page.project.description && (
            <p className="text-sm text-muted-foreground">{page.project.description}</p>
          )}
        </div>
      </header>

      <Tabs defaultValue="files" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="files">{t('project.detail.tab.files')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('project.detail.tab.tasks')}</TabsTrigger>
          <TabsTrigger value="sessions">{t('project.detail.tab.sessions')}</TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="min-h-0 flex-1">
          <div className="flex h-full gap-4">
            <div className="w-72 flex-shrink-0">
              <ProjectFilesPanel
                projectId={projectId}
                files={page.files}
                onOpen={(path) => void handleOpenFile(path)}
                onDelete={(path) => void page.deleteFile(path)}
              />
            </div>

            {openedFile !== null && fileContent !== null && (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium">{openedFile}</span>
                  <Button variant="ghost" size="sm" onClick={handleCloseFile}>
                    {t('common.close')}
                  </Button>
                </div>
                <ScrollArea className="flex-1 rounded-md border p-3">
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {fileContent}
                  </pre>
                </ScrollArea>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <ProjectTaskBoard
              tasks={page.tasks}
              onCreateTask={(status) => void page.createTask(status)}
              onUpdateStatus={page.updateTaskStatus}
              onDeleteTask={page.deleteTask}
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="sessions" className="min-h-0 flex-1">
          <LinkedSessionsList
            sessions={page.sessions}
            workspaceId={activeWorkspaceId ?? ''}
            onOpen={(s) =>
              void navigate({
                to: '/workspaces/$workspaceId/sessions/$sessionId',
                params: { workspaceId: s.workspaceId, sessionId: s.id },
              })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface LinkedSessionsListProps {
  readonly sessions: readonly Session[];
  readonly workspaceId: string;
  readonly onOpen: (session: Session) => void;
}

function LinkedSessionsList({ sessions, onOpen }: LinkedSessionsListProps) {
  const { t } = useTranslate();

  if (sessions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t('project.detail.sessions.empty')}
      </p>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-md border">
      {sessions.map((session) => (
        <button
          key={session.id}
          type="button"
          className="flex items-center px-4 py-3 text-left text-sm hover:bg-accent/30"
          onClick={() => onOpen(session)}
        >
          <span className="truncate">{session.name}</span>
        </button>
      ))}
    </div>
  );
}

export const Route = createFileRoute('/_app/projects/$projectId')({
  component: ProjectDetailPage,
});
