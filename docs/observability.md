# Observabilidade

O template mantém a observabilidade avançada opcional. A API continua funcionando normalmente sem Grafana, Prometheus, Loki, Tempo ou Alloy.

## O que existe

| Sinal        | Implementação                             | Finalidade                                                 |
| ------------ | ----------------------------------------- | ---------------------------------------------------------- |
| Logs         | Pino em JSON + Grafana Alloy + Loki       | localizar erros e acompanhar requisições em tempo real     |
| Métricas     | `@prometheus-io/client` + Prometheus      | volume, status HTTP, latência e métricas do Node.js        |
| Traces       | OpenTelemetry + Alloy + Tempo             | acompanhar uma requisição pelos componentes instrumentados |
| Visualização | Grafana                                   | consultar logs, métricas e traces no mesmo lugar           |
| Correlação   | `requestId`/`reqId`, `traceId` e `spanId` | relacionar resposta, log e trace                           |

## Execução normal

Para trabalhar sem a stack avançada:

```bash
docker compose up --build -d
```

Nesse modo, `METRICS_ENABLED` e `OTEL_ENABLED` permanecem desativados por padrão. Os logs Pino e o `requestId` continuam disponíveis.

## Execução com observabilidade

Dentro de `templates/api-postgres`, execute:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  up --build -d
```

No PowerShell, o mesmo comando pode ser executado em uma linha:

```powershell
docker compose -f docker-compose.yml -f docker-compose.observability.yml up --build -d
```

Serviços disponíveis:

| Serviço         | URL                                    | Uso                                                |
| --------------- | -------------------------------------- | -------------------------------------------------- |
| API             | `http://localhost:3000/api/v1`         | aplicação                                          |
| Métricas da API | `http://localhost:3000/api/v1/metrics` | coleta do Prometheus                               |
| Grafana         | `http://localhost:3001`                | interface principal; login local `admin` / `admin` |
| Prometheus      | `http://localhost:9090`                | consulta direta de métricas                        |
| Loki            | `http://localhost:3100`                | API de logs                                        |
| Tempo           | `http://localhost:3200`                | API de traces                                      |
| Alloy           | `http://localhost:12345`               | estado do coletor                                  |

O dashboard provisionado automaticamente chama-se **NestJS API Overview**. Ele apresenta taxa de requisições, erros HTTP 5xx, latência p95 e logs da API.

Para encerrar sem apagar volumes:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  down
```

## Variáveis

```dotenv
LOG_PRETTY=true
METRICS_ENABLED=false
OTEL_ENABLED=false
OTEL_SERVICE_NAME=api-postgres
OTEL_SERVICE_VERSION=0.1.0
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
```

- `LOG_PRETTY=true` facilita a leitura no terminal local.
- A composição opcional usa `LOG_PRETTY=false`, pois o Loki deve receber JSON estruturado.
- `METRICS_ENABLED=true` habilita `GET /api/v1/metrics` e a coleta de métricas HTTP/Node.js.
- `OTEL_ENABLED=true` habilita instrumentação e exportação de traces.
- `OTEL_SERVICE_NAME` diferencia aplicações no backend de observabilidade.

## Retenção e rotação

O Loki mantém logs técnicos por 30 dias (`720h`). A retenção é aplicada pelo Compactor sobre o armazenamento TSDB/filesystem persistido em `loki_data`; chunks são marcados e removidos de forma assíncrona. O índice usa período de 24 horas, requisito da retenção.

Todos os containers usam o driver `json-file` com `max-size=20m` e `max-file=5`. Essa rotação protege o disco do host mesmo quando Alloy ou Loki estão indisponíveis. Ela não substitui a retenção do Loki: são duas camadas diferentes.

Para conferir a configuração do Loki antes do deploy:

```powershell
docker run --rm -v "${PWD}\observability\loki\config.yml:/etc/loki/config.yml:ro" grafana/loki:3.5.3 "-config.file=/etc/loki/config.yml" "-verify-config=true"
```

Alterações de retenção do Loki valem para novos dados ingeridos depois da configuração. Monitore o espaço do volume, pois o backend filesystem não remove dados em resposta a pouco espaço livre.

## Investigação de um erro

1. Copie o `requestId` retornado em `meta.requestId` pela API.
2. Abra o Grafana em `http://localhost:3001`.
3. No Explore, selecione Loki e pesquise o valor no campo `reqId` do log.
4. No log encontrado, copie o `traceId`.
5. Abra o trace correspondente no Tempo para visualizar duração e chamadas instrumentadas.

O `requestId` da resposta e o `reqId` do log possuem o mesmo valor. O `traceId` pertence ao OpenTelemetry e conecta os spans daquela execução.

## Produção

Use `docker-compose.production.yml`. Ele mantém métricas e observabilidade habilitadas internamente, bloqueia `/metrics` no Caddy, não publica Loki, Tempo, Prometheus ou Alloy e liga o Grafana somente a `127.0.0.1`. Consulte o [guia de produção](production.md).

Em projetos maiores, a mesma API também pode exportar OTLP para uma plataforma gerenciada. Backup e alertas devem ser definidos de acordo com o ambiente real.
