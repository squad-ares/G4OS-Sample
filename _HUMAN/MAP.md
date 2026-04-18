# MAPA ESTRUTURAl

.changeset/ - Controlador de versões, gerado pelo changeset
----------
.github/
    - branch-protection-v2.yml - Configuração para proteção de branch (Deve ser criada no GitHub)
    - branch-protection.yml - Configuração para proteção de branch (Deve ser criada no GitHub)
    - CODEOWNERS - Configuração de quem pode fazer o merge de um PR
    - COMMIT_TEMPLATE.md - Template de como um commit deve ser feito
    - pull_request_template.md - Template de como um PR deve ser feito
    - teams.md - Exemplo de como organizar os times do projeto (Apenas uma aspiração)
----------
.turbo/ - Pacote gerado pelo turbo
----------
.vscode/ - COnfigurações da IDE, como formatação, snippets, extensões necessárias e etc.
----------
apps/
 - desktop/ - [LEIA](_HUMAN/APPS/DESKTOP/.md)
 - viewer/ - [LEIA](_HUMAN/APPS/VIEWER/.md)
----------
docs/
 - ADRs - Documentos que explicam em ordem cronológica as decisões tomadas ao longo do projeto (LEIA)
 - commits.md - Um guia estrutural de como fazer commits bem estruturados
 - typescript-strictness.md - Explicação de algumas regras de typescript que podem causar confusão
----------
node_modules/ - Dependências instaladas (Gerada automaticamente)
----------
packages/
 - ipc/ - [LEIA](_HUMAN/PACKAGES/IPC/.md)
 - kernel/ - [LEIA](_HUMAN/PACKAGES/KERNEL/.md)
 - platform/ - [LEIA](_HUMAN/PACKAGES/PLATFORM/.md)
 - sources/ - [LEIA](_HUMAN/PACKAGES/SOURCES/.md)
 - ui/ - [LEIA](_HUMAN/PACKAGES/PLATFORM/.md)
----------
scripts/
 - biome-rules.ts - Ainda vazio, sem definição de regras
 - check-exports.ts - Script auxiliar de desenvolvimento para o uso da lib attw (Are The Types Wrong?)
 - check-file-lines.ts - Script para calcular o número de linhas de cada arquivo, evitando arquivos grandes
 - check-main-size.ts - Script de monitoramento do `main` principal, evitando sobrecarga de processos
 - check-size.ts - Script de desenvolvimento auxiliar para o uso da lib size-limit
 - new-adr.ts - Script de geração de adr seguindo um template mínimo
----------
.dependency-cruiser.cjs - Definição das regras de fronteira do código, impedindo que determinados pacotes importem outros. Isso preserva a integridade do código.
----------
.gitignore - Lista de arquivos e diretórios que não devem ser enviados ao github
----------
.npmrc - Configurações para instalação e autenticação de pacotes no npm
----------
.nvmrc - Define qual versão do Node.js deve ser usada (Na máquina do dev, servidor e CI)
----------
.size-limit.json - Arquivo de configuração do size-limit. Script que auxilia no cálculo de tamanho do pacote final. (Atualmente vazio)
----------
biome.json - Nossa substituição do Eslint, Prettier e etc. É mais robusta e permite customização (Ligeiramente mais complexa)
----------
commitlint.config.js - Definição das regras de commit, sem elas o commit não será permitido e terminal lançará erro
----------
CONTRIBUTING.md - Documentos para novos membros do projeto com as regras que o repositório segue
----------
knip.json - Arquivo de configuração do Knip (Pacote de limpeza). COm definições do que ele deve percorrer e ignorar.
----------
lefthook.yml - Configuração de git hooks, executa scripts em diferentes momentos de interação com o git
----------
LICENSE - Termo de uso do projeto
----------
package.json - Fundação estrutural do projeto, definindo dependências e scripts
----------
pnpm-lock.yaml -  Garante que as versões dos pacotes instalados sejam os mesmo em qualquer dispositivo físico ou servidor
----------
pnpm-workspace.yaml - Definições globais do workspace do pnpm. Principalmente para definir quais pacotes o monorepo possui
----------
README.md - Documentação base do projeto
----------
tsconfig.base.json - Configuração base do typescript, que é replicada globalmente dentro de todos os packages e apps
----------
turbo.json - Configurações gerais do monorepo, definindo quais tarefas executar e como.
----------