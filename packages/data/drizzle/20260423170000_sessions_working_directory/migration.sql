-- TASK-OUTLIER-19: persistir diretório de trabalho escolhido pelo usuário
-- na sessão. Tool handlers (OUTLIER-09) lêem como `ctx.workingDir`.
-- Nullable — quando não definido, TurnDispatcher cai no workspace default
-- (`workspace.defaults.workingDirectory`).

ALTER TABLE `sessions` ADD COLUMN `working_directory` text;
