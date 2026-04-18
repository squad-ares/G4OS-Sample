# Explicação NPL do que cada script faz

* build - Gera as pastas finais do projeto, aquelas que realmente serão usadas com extensão .js
----------
* typecheck - Verifica se não há problemas de tipos em TODOS os arquivos .ts do monorepo
---------- 
* lint - Verifica se não há problemas de validação nas regras do biome
----------
* lint:fix - Verifica se não há problemas + tenta corrigir problemas simples como: espaços em branco, quebra de linha e etc
----------
* test - Executa todos os arquivos .test.ts do monorepo
----------
* test:watch - Executa todos os arquivos .test.ts do monorepo, e se algum arquivo muda, ele é reiniciado (Ideal para quando um teste esta quebrando e precisamos corrigir.)
---------- 
* dev - Inicia o monorepo em modo de desenvolvimento, executando todos os arquivos .ts do monorepo
----------
* clean - Remove todos os caches de instalação, incluindo pastas node_modules
----------
* prepare - Atualmente, prepara o lefthook, mas pode ser usado para qualquer coisa que precise ser executada imediatamente após o comando de instalação
----------
* check:file-lines - Executa o script `check-file-lines`, que percorre todos os arquivos do projeto verificando se o número de linhas é superior a `500`, O valor das linhas é dinâmico e pode ser alterado dentro do arquivo
----------
* check:circular - Utiliza o pacote `madge` (uma ferramenta de análise estática de código), procurando qualquer tipo de dependência circular, que é quando um arquivo o arquivo A importa o B mas o B também importa o A.
----------
* check:cruiser - Utiliza o pacote `depcruise` com o arquivo de configuração `.dependency-cruiser.cjs`, que possui regras de fronteira entre pacotes, definindo quem pode importar de quem. É uma forma de respeitar que o código não viola as diretrizes de design.
----------
* check:dead-code - Utiliza o pacote `knip` (limpeza). Ele encontra todo tipo de "lixo" no código. Exemplos: arquivos não utilizados, exports não utilizados, dependências fantasma ou zumbis. Utiliza o arquivo `knip.json` na raiz do monorepo.
----------
* check:unused-deps - Realiza o mesmo processo de limpeza do `dead-code` porém, focado nas dependências.
----------
* check:exports - Funciona como um "guardão de compatibilidade", ele utiliza o pacote attw (Are The Types Wrong?). Ele encontra problemas clássicos como:
    - Arquivos ESM com tipos no formato CJS (Que representa uma diferença estrutural)
    - Caminhos `exports` que apontem para arquivos não existentes
    - Exitar erros de "Module Not Found" por quem consome o pacote
O script `check-exports.ts`, é um auxiliar criado para exitar que pacotes em etapa de scaffolding (não publicáveis) ou que ainda não possuem um `dist/`, sejam validados e quebrem a validação.
----------
* check:size - Utiliza o pacote `size-limit` para calcular o peso real do código para o cliente final.. Além de calcular o tempo para carregar e baixar o código (Impacto direto na inicialização do app). O script `check-size.ts`, é uma auxiliar, exitando quebras na fase de desenvolvimento. O script busca pelo arquivo `.size-limit.json` na raiz no monorepo e verifica as regras definidas para cada caminho.
----------
* check:main-size - **ULTRA IMPORTANTE**. Esse script combate um dos problemas mais comuns do Electron (Main Process Gigante ou God Object). No Electron o processo `main` tem privilégios totais de sistema, a maioria das pessoas coloca tudo lá. O foco desse script esta exatamente em `apps/desktop/src/main/**/*.ts`, ele ignora arquivos tde teste para não punir o cálculo e usa quebra de linhas simples. OBS (Atual): O limite de 2000 linhas é bem rígido, é poder ser necessário aumentar.
    - FILE_LIMIT: Garante que nenhum arquivo se torne um labirinto de linhas.
    - MAIN_LIMIT: Garante que a aplicação toda não dependa de um "God Object".
    - Pontos que esse script obriga:
        - Mover lógica para packages/, se algo cresceu demais, precisamos mover
        - Uso Intensivo de IPC, for;ca a criação de contratos claros ao invés de funções soltas
        - Facilidade de Manutenção, é muito mais fácil debugar um processo `main` que apenas coordena janelas.
---------- 
* changeset - É um controlador de versões. Evitando que a necessidade de alterar cada número de verão manualmente. (O único executado localmente)
---------- 
* changeset:version - É o cérebro do processo. Ele lê todos os arquivos `.md` de `.changeset/`, atualizado automaticamente o campo `version` do `package.json` de cada pacote e escrever as alterações no arquivo `CHANGELOG.md`. Além de sincronizar o arquivo `pnpm-lock.yaml` com as novas versões.
---------- 
* changeset:publish - Faz o trabalho de registrar o novo pacote. (Atualmente não há nenhum pacote sendo publicado). Precisamos verificar a necessidade real, visto que todos os pacatos são para uso da aplicação.
---------- 
* changeset:status - Ele compara as alterações do código atual com o da main. Garantindo que ninguém esqueça de documentar as mudanças realizadas no código. Sem isso, o PR é recusado.
---------- 
* adr:new - Criar um novo documento de ADR (Architecture Decision Record) seguindo um template mínimo.
----------  
