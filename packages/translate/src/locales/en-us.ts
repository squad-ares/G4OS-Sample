export const enUS = {
  'app.name': 'G4 OS',
  'app.mark': 'G4',
  'routing.notFound.title': 'Page not found',
  'routing.notFound.description': 'The view you requested is not available in this build yet.',

  'auth.login.title': 'Sign in to G4 OS',
  'auth.login.subtitle.email': 'We will send a verification code to your email.',
  'auth.login.subtitle.otp': 'Enter the code we sent to your email.',
  'auth.email.label': 'Email',
  'auth.email.placeholder': 'you@email.com',
  'auth.email.submit': 'Send code',
  'auth.email.submitting': 'Sending...',
  'auth.email.invalid': 'Enter a valid email address',
  'auth.otp.sentTo': 'We sent a 6-digit code to {{email}}.',
  'auth.otp.label': 'Verification code',
  'auth.otp.placeholder': '000000',
  'auth.otp.submit': 'Verify',
  'auth.otp.submitting': 'Verifying...',
  'auth.otp.useAnotherEmail': 'Use another email',
  'auth.otp.invalidFormat': 'The code must have 6 digits',
  'auth.otp.resend': 'Resend code',
  'auth.otp.resendWithSeconds': 'Resend in {{seconds}}s',
  'auth.otp.resending': 'Resending...',
  'auth.otp.spamHint': 'Check your spam folder if you do not see the email.',
  'auth.otp.changeEmail': 'Change email',
  'auth.error.sendOtpFallback': 'Could not send the code. Please try again.',
  'auth.error.verifyFallback': 'Invalid code. Please review it and try again.',
  'auth.error.resetRequired': 'Restart the login flow. The previous session expired.',
  'auth.note.runtime.title': 'Runtime ready',
  'auth.note.runtime.description':
    'OTP, shell contracts and locale now share a single desktop foundation.',
  'auth.note.ui.title': 'UI core',
  'auth.note.ui.description': 'Palette, density and composition are being brought from V1 into V2.',
  'auth.note.features.title': 'Ready for TASK-11',
  'auth.note.features.description':
    'The base is now prepared so new features do not reintroduce loose strings or layout drift.',

  'onboarding.progress.ariaLabel': 'Progress',
  'onboarding.workspace.title': 'What should we call your workspace?',
  'onboarding.workspace.description':
    'A workspace organizes your chats and projects around a single context.',
  'onboarding.workspace.placeholder': 'e.g. Work',
  'onboarding.workspace.errorRequired': 'Enter a workspace name',
  'onboarding.workspace.next': 'Next',
  'onboarding.workspace.creating': 'Creating...',
  'onboarding.agent.title': 'Which agent do you want to start with?',
  'onboarding.agent.description':
    'You can change this later in the workspace settings without losing anything.',
  'onboarding.agent.skip': 'Skip for now',
  'onboarding.agent.claude.provider': 'Anthropic',
  'onboarding.agent.codex.provider': 'OpenAI',
  'onboarding.ready.title': 'Everything is ready',
  'onboarding.ready.description': 'Your workspace has been prepared. Shall we start?',
  'onboarding.ready.start': 'Start first session',
  'onboarding.ready.starting': 'Creating session...',
  'onboarding.intro.title': 'Shell foundation before features.',
  'onboarding.intro.description':
    'Auth, shell contracts, locale and UI baseline are being stabilized now so the next epics land on a cohesive product surface.',
  'onboarding.intro.card.v1.label': 'V1 core',
  'onboarding.intro.card.v1.text': 'Palette, density and hierarchy are being reused in V2.',
  'onboarding.intro.card.i18n.label': 'i18n',
  'onboarding.intro.card.i18n.text':
    'Typed structure for pt-BR and en-US from the shell base onward.',
  'onboarding.intro.card.auth.label': 'Auth',
  'onboarding.intro.card.auth.text':
    'OTP with a clear environment contract and real desktop wiring.',

  'shell.header.productBadge': 'Workspace hub',
  'shell.header.signOut': 'Sign out',
  'shell.header.commandPalette': 'Actions',
  'shell.header.shortcuts': 'Shortcuts',
  'shell.language.switcherLabel': 'Language',
  'shell.language.switcherHint': 'Change the application language',
  'shell.header.fallbackDescription':
    'The authenticated shell now exposes a single navigation matrix before TASK-11 features arrive.',
  'shell.sidebar.label': 'Workspaces',
  'shell.sidebar.ariaLabel': 'Activity rail',
  'shell.sidebar.createWorkspace': 'Create workspace',
  'shell.sidebar.empty': 'No workspaces yet',
  'shell.sidebar.support': 'Help and support',
  'shell.nav.workspace.switcher': 'Switch workspace',
  'shell.nav.ariaLabel': 'Global shell navigation',
  'shell.nav.matrixBadge': 'Navigation matrix',
  'shell.nav.matrixDescription':
    'The shell now exposes a canonical list of navigators, placeholders and page contracts before the feature epics land.',
  'shell.nav.section.workspace': 'Workspace',
  'shell.nav.section.automation': 'Automation',
  'shell.nav.section.system': 'System',
  'shell.nav.status.ready': 'Ready',
  'shell.nav.status.planned': 'Planned',
  'shell.nav.workspaces.label': 'Workspaces',
  'shell.nav.workspaces.description':
    'Entry point for managed contexts, session selection and workspace-level empty states.',
  'shell.nav.sources.label': 'Sources',
  'shell.nav.sources.description':
    'Connector catalog, source health and activation contracts will live here.',
  'shell.nav.projects.label': 'Projects',
  'shell.nav.projects.description':
    'Project surfaces, linked sessions and managed file contexts will land here.',
  'shell.nav.marketplace.label': 'Marketplace',
  'shell.nav.marketplace.description':
    'Catalog, install status and publication flows will occupy this navigator.',
  'shell.nav.companyContext.label': 'Company Context',
  'shell.nav.companyContext.description':
    'Internal company documents, hierarchy and PR review flows belong here.',
  'shell.nav.skills.label': 'Skills',
  'shell.nav.skills.description':
    'Reusable skills and workspace-curated capabilities will surface here.',
  'shell.nav.workflows.label': 'Workflows',
  'shell.nav.workflows.description':
    'Human-in-the-loop and automatable workflow surfaces will land here.',
  'shell.nav.scheduler.label': 'Scheduler',
  'shell.nav.scheduler.description':
    'Recurring executions, run history and recovery states will live here.',
  'shell.nav.vigia.label': 'Vigia',
  'shell.nav.vigia.description':
    'Watchers, health status and notification contracts are grouped here.',
  'shell.nav.news.label': 'News',
  'shell.nav.news.description':
    'Release notes and product updates will be available through this page.',
  'shell.nav.settings.label': 'Settings',
  'shell.nav.settings.description':
    'Locale, preferences and global shell guardrails are managed here.',
  'shell.nav.support.label': 'Support',
  'shell.nav.support.description':
    'Keyboard shortcuts, accessibility baseline and support guidance live here.',
  'shell.a11y.skipToContent': 'Skip to main content',
  'shell.placeholder.badge': 'Feature contract',
  'shell.placeholder.title': 'This surface already has a shell contract',
  'shell.placeholder.description':
    'The feature body is still pending, but route, navigator entry, empty state and accessibility baseline are already stable for the next epics.',
  'shell.placeholder.contractBadge': 'Shared placeholder',
  'shell.placeholder.shortcutTitle': 'Global actions are already active',
  'shell.placeholder.shortcutDescription':
    'Use the command palette and shortcut list to navigate the shell even before each feature is fully implemented.',
  'shell.shortcuts.title': 'Keyboard shortcuts',
  'shell.shortcuts.description':
    'The list below is generated from the shell action registry and remains the single source of truth for global shortcuts.',
  'shell.shortcuts.listAriaLabel': 'Keyboard shortcut list',
  'shell.command.inputPlaceholder': 'Search actions and pages...',
  'shell.command.empty': 'No matching action found.',
  'shell.command.section.navigation': 'Navigation',
  'shell.command.section.system': 'System',
  'shell.action.commandPalette.label': 'Open command palette',
  'shell.action.commandPalette.description':
    'Search global pages and shell actions from a single dialog.',
  'shell.action.shortcuts.label': 'Open keyboard shortcuts',
  'shell.action.shortcuts.description':
    'Open the generated shortcut list and accessibility baseline.',
  'shell.action.workspaces.label': 'Go to workspaces',
  'shell.action.workspaces.description': 'Open the workspace home page.',
  'shell.action.sources.label': 'Go to sources',
  'shell.action.sources.description': 'Open the sources placeholder and contracts.',
  'shell.action.projects.label': 'Go to projects',
  'shell.action.projects.description': 'Open the projects placeholder and contracts.',
  'shell.action.marketplace.label': 'Go to marketplace',
  'shell.action.marketplace.description': 'Open the marketplace placeholder and contracts.',
  'shell.action.settings.label': 'Go to settings',
  'shell.action.settings.description': 'Open settings and locale preferences.',
  'shell.action.signOut.label': 'Sign out',
  'shell.action.signOut.description': 'End the current authenticated session.',
  'shell.state.loading.badge': 'Loading',
  'shell.state.loading.title': 'Preparing the shell',
  'shell.state.loading.description':
    'The router is waiting for the desktop runtime to answer before showing the next screen.',
  'shell.state.loading.progress': 'Loading environment…',
  'shell.state.error.badge': 'Attention',
  'shell.state.error.title': 'The shell could not be prepared',
  'shell.state.error.description':
    'Review the startup preflight report before continuing with feature work.',

  'page.workspaces.badge': 'Workspace surface',
  'page.workspaces.title': 'Workspaces',
  'page.workspaces.description':
    'Choose an existing workspace or open onboarding to create the first managed context.',
  'page.workspaces.emptyTitle': 'The shell foundation is ready',
  'page.workspaces.emptyDescription':
    'Workspace listing still depends on TASK-11 integration, but login, shell and locale wiring are now active.',
  'page.workspaces.contractBadge': 'Current empty state',
  'page.workspaces.nextTitle': 'Next shell step',
  'page.workspaces.nextDescription':
    'This page is now responsible only for rendering workspaces and restoring context, not for inventing new layout rules.',

  'page.settings.badge': 'Global preferences',
  'page.settings.title': 'Settings',
  'page.settings.description':
    'Theme, language and global preferences now share a stable shell contract.',
  'page.settings.localeBadge': 'Locale',
  'page.settings.localeTitle': 'Language and locale',
  'page.settings.localeDescription':
    'Every new shell feature must go through the translation package instead of shipping direct UI strings.',
  'page.settings.localeAriaLabel': 'Preferred application language',
  'page.settings.localePlaceholder': 'Select a language',
  'page.settings.shortcutsTitle': 'Shared shell shortcuts',
  'page.settings.shortcutsDescription':
    'The shortcut list below is generated from the central action registry.',

  'page.session.badge': 'Session detail contract',
  'page.session.title': 'Session detail',
  'page.session.meta': 'Workspace: {{workspaceId}}  Session: {{sessionId}}',
  'page.session.pendingTitle': 'Chat body is still pending',
  'page.session.pending': 'Chat implementation continues in TASK-11.',
  'page.session.contractBadge': 'Session surface',

  'page.support.badge': 'Support surface',
  'page.support.title': 'Support and accessibility',
  'page.support.description':
    'This page concentrates the generated shortcut list and the baseline guidance for keyboard-first navigation.',
  'page.support.shortcutsBadge': 'Action registry',
  'page.support.shortcutsTitle': 'Generated shortcut list',
  'page.support.shortcutsDescription':
    'Every global shortcut shown here comes from the same action registry consumed by the command palette.',
  'page.support.a11yTitle': 'Accessibility baseline',
  'page.support.a11yDescription':
    'Skip links, focus-visible states, dialog focus restore and screen-reader-friendly status panels are now part of the shell baseline.',

  'locale.pt-BR': 'Portuguese (Brazil)',
  'locale.en-US': 'English (United States)',

  'ui.password.show': 'Show password',
  'ui.password.hide': 'Hide password',
  'ui.dialog.close': 'Close dialog',
  'ui.spinner.loading': 'Loading',
} as const;

export type TranslationKey = keyof typeof enUS;
