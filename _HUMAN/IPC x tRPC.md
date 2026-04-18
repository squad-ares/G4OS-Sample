# IPC

- Significado: Inter Process Communication (Comunicação entre processos)

Atualmente no Electron temos 

Main - NodeJS, onde roda toda a camada que possui acesso total 
Renderer - Camada de renderização
Preload - O "Atendente", quem conecta o Render ao Main, evitando exposição direta do Main. Ele expõe tudo que está acessível no Main para o Renderer

# tRCP

- Significado: Transport RPC (RPC de transporte).Se o IPC é o cabo de rede, o tRCP é o protocolo de comunicação.

Com esse protocolo, nos damos fim às "Strings Mágicas" do Electron

Sem esse protocolo, o processo seria algo como:
 - Main: ipcMain.handle('get-keychain-value', ...)
 - Renderer: ipcRenderer.invoke('get-keychain-value', ...)
Se errarmos uma letra do alfabeto, o IPC não funcionaria


## Ganhos reais 

- Batching: No IPC se uma tela precisa de buscar 5 informações, elas dispará 5 mensagens IPC. No tRCP, nos conseguimos empacotar todas essas informações em uma única mensagem, reduzindo tempo de carregamento e a sensação de lentidão da aplicação.
- Telas brancas: No Electron os maiores erros são gerados por erros de conexão em IPCs, com o tRCP + ZOD, a validação ocorre na porta de entrada, evitando que qualquer tipo de fluxo sera interrompido de forma acidental.
- Utilização de Cache com Tanstack Query: Elimina a necessidade de carregamento desnecessário e repetitivo dos dados. Se apenas uma parte dos dados atualizou, conseguimos atualizar a tela apenas com o que mudou.