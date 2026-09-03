# Backlog

## Operação da VPS

- [ ] Definir retenção explícita do Prometheus e do Tempo, considerando o
  espaço em disco disponível na VPS.
- [ ] Automatizar backups do PostgreSQL para um destino externo à VPS, com
  criptografia e retenção definida.
- [ ] Agendar e documentar testes periódicos de restauração dos backups em um
  banco descartável.
- [ ] Configurar entre 1 e 2 GB de swap na VPS e monitorar para que ela seja
  usada somente em picos, nunca continuamente.
- [ ] Automatizar a remoção segura de imagens Docker antigas, preservando as
  imagens utilizadas pelos containers e uma versão válida para rollback.

Esses itens dependem da escolha e do provisionamento da hospedagem. As
configurações de rotação dos logs Docker e retenção de 30 dias do Loki já estão
implementadas e, por isso, não fazem parte desta lista pendente.

## Monitoramento da infraestrutura

- [ ] Adicionar Node Exporter para CPU, RAM, disco, swap e rede da VPS.
- [ ] Adicionar cAdvisor para recursos e reinicializações por container.
- [ ] Adicionar Postgres Exporter com consultas leves e intervalo seguro.
- [ ] Configurar o Prometheus para coletar essas métricas a cada 15 segundos.
- [ ] Criar dashboards no Grafana com valores atuais, médias, picos e histórico.
- [ ] Criar alertas para CPU, RAM, disco, swap, containers e indisponibilidade
  da API.
- [ ] Definir limites de CPU e RAM dos exporters e validar o impacto no perfil
  de 2 vCPU / 4 GB.
