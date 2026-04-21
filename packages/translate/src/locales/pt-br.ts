import type { TranslationKey } from './en-us.ts';

export const ptBR: Readonly<Record<TranslationKey, string>> = {
  'app.name': 'G4 OS',
  'app.mark': 'G4',

  'chat.composer.placeholder': 'No que gostaria de trabalhar?',
  'chat.composer.ariaLabel': 'Campo de mensagem',
  'chat.composer.send': 'Enviar mensagem',
  'chat.composer.stop': 'Parar resposta',
  'chat.composer.submitHint.enter': 'Enter para enviar · Shift+Enter para nova linha',
  'chat.composer.submitHint.cmdEnter': '⌘/Ctrl + Enter para enviar · Enter para nova linha',
  'chat.composer.attachFiles': 'Anexar arquivos',
  'chat.composer.dropZone.ariaLabel': 'Área de soltar arquivos',
  'chat.composer.dropZone.dropHint': 'Solte os arquivos aqui',
  'chat.composer.removeAttachment': 'Remover anexo',

  'chat.transcript.ariaLabel': 'Transcrição da conversa',
  'chat.transcript.empty': 'Nenhuma mensagem ainda.',

  'chat.search.open': 'Buscar na conversa',
  'chat.search.close': 'Fechar busca',
  'chat.search.ariaLabel': 'Buscar na conversa',
  'chat.search.placeholder': 'Buscar…',
  'chat.search.noResults': 'Sem resultados',
  'chat.search.prevMatch': 'Resultado anterior',
  'chat.search.nextMatch': 'Próximo resultado',

  'chat.actions.retry': 'Tentar novamente a partir desta mensagem',
  'chat.actions.branch': 'Criar ramificação a partir daqui',
  'chat.actions.cancel': 'Cancelar',
  'chat.actions.confirmDestructive': 'Excluir',
  'chat.actions.truncateTitle': 'Excluir mensagens a partir daqui?',
  'chat.actions.truncateDescription':
    'Isso removerá permanentemente todas as mensagens após este ponto. Essa ação não pode ser desfeita.',

  'chat.modelSelector.ariaLabel': 'Selecionar modelo',
  'chat.modelSelector.placeholder': 'Selecionar modelo',
  'chat.modelSelector.searchPlaceholder': 'Buscar modelos…',

  'chat.thinkingLevel.ariaLabel': 'Nível de raciocínio',

  'chat.permission.title': 'Solicitação de permissão',
  'chat.permission.description': 'O agente quer executar',
  'chat.permission.moreQueued': '{{count}} mais na fila',
  'chat.permission.deny': 'Negar',
  'chat.permission.allowOnce': 'Permitir uma vez',
  'chat.permission.allowSession': 'Permitir na sessão',
  'chat.permission.alwaysAllow': 'Sempre permitir',
  'chat.permission.shortcutDeny': 'N',
  'chat.permission.shortcutAllow': 'P',

  'chat.composer.voice.ariaLabel': 'Entrada de voz',
  'chat.composer.voice.cancelAriaLabel': 'Cancelar gravação',
  'chat.composer.voice.transcribing': 'Transcrevendo…',
  'chat.composer.voice.maxDuration': 'Duração máxima de gravação atingida',

  'routing.notFound.title': 'Pagina nao encontrada',
  'routing.notFound.description': 'A tela solicitada ainda nao esta disponível nesta build.',

  'auth.login.title': 'Entrar no G4 OS',
  'auth.login.subtitle.email': 'Enviaremos um código de verificação para seu e-mail.',
  'auth.login.subtitle.otp': 'Digite o código enviado para seu e-mail.',
  'auth.email.label': 'E-mail',
  'auth.email.placeholder': 'seu@email.com',
  'auth.email.submit': 'Enviar código',
  'auth.email.submitting': 'Enviando...',
  'auth.email.invalid': 'Informe um e-mail valido',
  'auth.otp.sentTo': 'Enviamos um código de 6 dígitos para {{email}}.',
  'auth.otp.label': 'Código de verificação',
  'auth.otp.placeholder': '000000',
  'auth.otp.submit': 'Verificar',
  'auth.otp.submitting': 'Verificando...',
  'auth.otp.useAnotherEmail': 'Usar outro e-mail',
  'auth.otp.invalidFormat': 'O código deve conter 6 dígitos',
  'auth.otp.resend': 'Reenviar código',
  'auth.otp.resendWithSeconds': 'Reenviar em {{seconds}}s',
  'auth.otp.resending': 'Reenviando...',
  'auth.otp.spamHint': 'Verifique sua caixa de spam se não receber o e-mail.',
  'auth.otp.changeEmail': 'Trocar e-mail',
  'auth.error.sendOtpFallback': 'Falha ao enviar o código. Tente novamente.',
  'auth.error.verifyFallback': 'Código invalido. Verifique e tente novamente.',
  'auth.error.resetRequired': 'Reinicie o login. A sessão anterior expirou.',
  'auth.note.runtime.title': 'Runtime pronto',
  'auth.note.runtime.description':
    'OTP, contratos do shell e locale agora compartilham a mesma fundação desktop.',
  'auth.note.ui.title': 'Core visual',
  'auth.note.ui.description':
    'Paleta, densidade e composição estão sendo trazidas da V1 para a V2.',
  'auth.note.features.title': 'Pronto para a TASK-11',
  'auth.note.features.description':
    'A base agora esta preparada para novas features sem reintroduzir strings soltas nem deriva visual.',

  'onboarding.progress.ariaLabel': 'Progresso',
  'onboarding.workspace.title': 'Como voce quer chamar seu workspace?',
  'onboarding.workspace.description':
    'Um workspace organiza seus chats e projetos dentro de um mesmo contexto.',
  'onboarding.workspace.placeholder': 'ex: Trabalho',
  'onboarding.workspace.errorRequired': 'Informe um nome para o workspace',
  'onboarding.workspace.next': 'Proximo',
  'onboarding.workspace.creating': 'Criando...',
  'onboarding.agent.title': 'Com qual agente voce quer começar?',
  'onboarding.agent.description':
    'Voce pode mudar isso depois nas configurações do workspace sem perder nada.',
  'onboarding.agent.skip': 'Pular por agora',
  'onboarding.agent.claude.provider': 'Anthropic',
  'onboarding.agent.codex.provider': 'OpenAI',
  'onboarding.ready.title': 'Tudo pronto',
  'onboarding.ready.description': 'Seu workspace foi preparado. Vamos começar?',
  'onboarding.ready.start': 'Iniciar primeira sessão',
  'onboarding.ready.starting': 'Criando sessão...',
  'onboarding.intro.title': 'Fundação do shell antes das features.',
  'onboarding.intro.description':
    'Auth, contratos do shell, locale e baseline visual estão sendo estabilizados agora para que os próximos épicos caiam sobre uma superfície de produto coesa.',
  'onboarding.intro.card.v1.label': 'Core da V1',
  'onboarding.intro.card.v1.text':
    'Paleta, densidade e hierarquia estão sendo reaproveitadas na V2.',
  'onboarding.intro.card.i18n.label': 'i18n',
  'onboarding.intro.card.i18n.text': 'Estrutura tipada para pt-BR e en-US desde o shell base.',
  'onboarding.intro.card.auth.label': 'Auth',
  'onboarding.intro.card.auth.text': 'OTP com contrato de ambiente claro e wiring real no desktop.',

  'shell.header.productBadge': 'Hub de workspaces',
  'shell.header.signOut': 'Sair',
  'shell.header.commandPalette': 'Acoes',
  'shell.header.shortcuts': 'Atalhos',
  'shell.language.switcherLabel': 'Idioma',
  'shell.language.switcherHint': 'Trocar o idioma da aplicação',
  'shell.header.fallbackDescription':
    'O shell autenticado agora expõe uma única matriz de navegação antes da chegada das features da TASK-11.',
  'shell.sidebar.label': 'Workspaces',
  'shell.sidebar.ariaLabel': 'Trilho de atividades',
  'shell.sidebar.createWorkspace': 'Criar workspace',
  'shell.sidebar.empty': 'Nenhum workspace ainda',
  'shell.sidebar.support': 'Ajuda e suporte',
  'shell.nav.workspace.switcher': 'Trocar de workspace',
  'shell.nav.ariaLabel': 'Navegação global do shell',
  'shell.nav.matrixBadge': 'Matriz de navegação',
  'shell.nav.matrixDescription':
    'O shell agora expõe a lista canônica de navegadores, placeholders e contratos de pagina antes da chegada dos próximos épicos.',
  'shell.nav.section.workspace': 'Workspace',
  'shell.nav.section.automation': 'Automação',
  'shell.nav.section.system': 'Sistema',
  'shell.nav.status.ready': 'Pronto',
  'shell.nav.status.planned': 'Planejado',
  'shell.nav.workspaces.label': 'Workspaces',
  'shell.nav.workspaces.description':
    'Entrada principal para contextos gerenciados, seleção de sessão e estados vazios do workspace.',
  'shell.nav.sources.label': 'Sources',
  'shell.nav.sources.description':
    'Catalogo de conectores, saúde das fontes e contratos de ativação moram aqui.',
  'shell.nav.projects.label': 'Projetos',
  'shell.nav.projects.description':
    'Superfícies de projeto, sessões vinculadas e contexto de arquivos gerenciados entram aqui.',
  'shell.nav.marketplace.label': 'Marketplace',
  'shell.nav.marketplace.description':
    'Catalogo, estado de instalação e fluxos de publicação ficam neste navegador.',
  'shell.nav.companyContext.label': 'Company Context',
  'shell.nav.companyContext.description':
    'Documentos internos, hierarquia e fluxos de PR da empresa pertencem a esta area.',
  'shell.nav.skills.label': 'Skills',
  'shell.nav.skills.description':
    'Skills reutilizáveis e capacidades curadas por workspace vao aparecer aqui.',
  'shell.nav.workflows.label': 'Workflows',
  'shell.nav.workflows.description':
    'Superfícies de workflow automatizáveis e com checkpoints humanos entram aqui.',
  'shell.nav.scheduler.label': 'Scheduler',
  'shell.nav.scheduler.description':
    'Execuções recorrentes, histórico de runs e estados de recuperação vivem aqui.',
  'shell.nav.vigia.label': 'Vigia',
  'shell.nav.vigia.description':
    'Watchers, saúde do sistema e contratos de notificação ficam agrupados aqui.',
  'shell.nav.news.label': 'Novidades',
  'shell.nav.news.description':
    'Release notes e atualizações de produto ficam disponíveis nesta pagina.',
  'shell.nav.settings.label': 'Configurações',
  'shell.nav.settings.description':
    'Locale, preferencias e guardrails globais do shell sao geridos aqui.',
  'shell.nav.support.label': 'Suporte',
  'shell.nav.support.description':
    'Atalhos de teclado, baseline de acessibilidade e orientações de suporte ficam aqui.',
  'shell.a11y.skipToContent': 'Ir para o conteúdo principal',
  'shell.placeholder.badge': 'Contrato de feature',
  'shell.placeholder.title': 'Esta superfície ja possui um contrato de shell',
  'shell.placeholder.description':
    'O corpo da feature ainda esta pendente, mas rota, entrada de navegação, empty state e baseline de acessibilidade ja estão estáveis para os próximos épicos.',
  'shell.placeholder.contractBadge': 'Placeholder compartilhado',
  'shell.placeholder.shortcutTitle': 'As acoes globais ja estão ativas',
  'shell.placeholder.shortcutDescription':
    'Use a command palette e a lista de atalhos para navegar pelo shell antes mesmo de cada feature ficar completa.',
  'shell.shortcuts.title': 'Atalhos de teclado',
  'shell.shortcuts.description':
    'A lista abaixo e gerada a partir do action registry do shell e permanece como fonte única de verdade para atalhos globais.',
  'shell.shortcuts.listAriaLabel': 'Lista de atalhos de teclado',
  'shell.command.inputPlaceholder': 'Buscar acoes e paginas...',
  'shell.command.empty': 'Nenhuma ação encontrada.',
  'shell.command.section.navigation': 'Navegação',
  'shell.command.section.system': 'Sistema',
  'shell.action.commandPalette.label': 'Abrir command palette',
  'shell.action.commandPalette.description':
    'Busque paginas globais e ações do shell a partir de um único dialogo.',
  'shell.action.shortcuts.label': 'Abrir atalhos de teclado',
  'shell.action.shortcuts.description':
    'Abra a lista gerada de atalhos e o baseline de acessibilidade.',
  'shell.action.workspaces.label': 'Ir para workspaces',
  'shell.action.workspaces.description': 'Abrir a pagina inicial de workspaces.',
  'shell.action.sources.label': 'Ir para sources',
  'shell.action.sources.description': 'Abrir o placeholder de sources e seus contratos.',
  'shell.action.projects.label': 'Ir para projetos',
  'shell.action.projects.description': 'Abrir o placeholder de projetos e seus contratos.',
  'shell.action.marketplace.label': 'Ir para marketplace',
  'shell.action.marketplace.description': 'Abrir o placeholder de marketplace e seus contratos.',
  'shell.action.settings.label': 'Ir para configurações',
  'shell.action.settings.description': 'Abrir configurações e preferencias globais.',
  'shell.action.signOut.label': 'Sair',
  'shell.action.signOut.description': 'Encerrar a sessão autenticada atual.',
  'shell.state.loading.badge': 'Carregando',
  'shell.state.loading.title': 'Preparando o shell',
  'shell.state.loading.description':
    'O roteador esta aguardando a resposta do runtime desktop antes de mostrar a proxima tela.',
  'shell.state.loading.progress': 'Carregando ambiente…',
  'shell.state.error.badge': 'Atenção',
  'shell.state.error.title': 'O shell nao conseguiu ser preparado',
  'shell.state.error.description':
    'Revise o relatório de preflight de startup antes de continuar o trabalho nas features.',

  'page.workspaces.badge': 'Superfície de workspace',
  'page.workspaces.title': 'Workspaces',
  'page.workspaces.description':
    'Escolha um workspace existente ou abra o onboarding para criar o primeiro contexto gerenciado.',
  'page.workspaces.emptyTitle': 'A fundação do shell esta pronta',
  'page.workspaces.emptyDescription':
    'A listagem real de workspaces ainda depende da integração da TASK-11, mas login, shell e locale ja estão ativos.',
  'page.workspaces.contractBadge': 'Empty state atual',
  'page.workspaces.nextTitle': 'Proximo passo do shell',
  'page.workspaces.nextDescription':
    'Esta pagina agora responde apenas por renderizar workspaces e restaurar contexto, sem inventar novas regras de layout.',

  'page.settings.badge': 'Preferencias globais',
  'page.settings.title': 'Configurações',
  'page.settings.description':
    'Tema, idioma e preferencias globais agora compartilham um contrato de shell estável.',
  'page.settings.localeBadge': 'Locale',
  'page.settings.localeTitle': 'Idioma e locale',
  'page.settings.localeDescription':
    'Toda nova feature do shell deve passar pelo package de tradução em vez de embarcar strings diretas na UI.',
  'page.settings.localeAriaLabel': 'Idioma preferido da aplicação',
  'page.settings.localePlaceholder': 'Selecione um idioma',
  'page.settings.shortcutsTitle': 'Atalhos compartilhados do shell',
  'page.settings.shortcutsDescription':
    'A lista de atalhos abaixo e gerada a partir do action registry central.',

  'page.session.badge': 'Contrato de detalhe da sessão',
  'page.session.title': 'Detalhe da sessão',
  'page.session.meta': 'Workspace: {{workspaceId}}  Sessão: {{sessionId}}',
  'page.session.pendingTitle': 'O corpo do chat ainda esta pendente',
  'page.session.pending': 'A implementação do chat continua na TASK-11.',
  'page.session.contractBadge': 'Superfície da sessão',

  'page.support.badge': 'Superfície de suporte',
  'page.support.title': 'Suporte e acessibilidade',
  'page.support.description':
    'Esta pagina concentra a lista gerada de atalhos e a orientação base para navegação keyboard-first.',
  'page.support.shortcutsBadge': 'Action registry',
  'page.support.shortcutsTitle': 'Lista gerada de atalhos',
  'page.support.shortcutsDescription':
    'Todo atalho global exibido aqui vem do mesmo action registry consumido pela command palette.',
  'page.support.a11yTitle': 'Baseline de acessibilidade',
  'page.support.a11yDescription':
    'Skip links, estados focus-visible, restauração de foco em dialogs e painéis amigáveis para screen reader agora fazem parte do baseline do shell.',

  'locale.pt-BR': 'Português (Brasil)',
  'locale.en-US': 'Ingles (Estados Unidos)',

  'ui.password.show': 'Mostrar senha',
  'ui.password.hide': 'Ocultar senha',
  'ui.dialog.close': 'Fechar dialogo',
  'ui.spinner.loading': 'Carregando',
};
