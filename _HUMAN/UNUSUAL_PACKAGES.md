# EXPLICAÇÃO DO QUE SÃO ALGUNS PACOTES INCOMUNS

- @arethetypeswrong/cli - Testador de estresse de compatibilidade. Enquanto o TS garante que o código está correto, o attw, garante que ele vai funcionar depois que instalado.
- knip - Verifica a "necessidade de existência" do código. Garantindo que não contenha lixo ou fique sujo
- lefthook - Gerenciador de git hooks, executa scripts em diferentes momentos de interação com o git
- madge - Focado em encontrar dependência circular, seguindo as regras descritas no arquivo de configuração `.dependency-cruiser.cjs`
- publint - Utilizado para seguir as regras de vizinhança do NPM. Detecta erros como inexistência de caminhos, confusões entre .js e .mjs. Ele foca no `package.json` e não no código.
- size-limit - Garante que o pacote final no exceda os limites definidos no arquivo `.size-limit.json`
- pino-roll - Rotaciona arquivos de log, faz limpezas e comprime