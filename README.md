[![Docker Build](https://github.com/docker-shef/conducktor/actions/workflows/main.yml/badge.svg)](https://github.com/docker-shef/conducktor/actions)

# POC Docker-shef Conducktor🦆 Repository

Conducktor is API server and conduc(🦆)tor of the docker-shef system. It handles requests from users and checks availabilities of shefRunners. Conducktor decides where to create containers and balances them between nodes properly. Conducktor triggers shefRunners via http calls to create or delete containers on docker hosts. Default 8044 port used for REST API endpoints. You can find specific endpoint documentation [here](https://github.com/docker-shef/docker-shef#api-endpoints).

For docker-shef system details visit [here](https://github.com/docker-shef/docker-shef).

## Conducktor Specific Configurations

There is just 4 variables to configure Conducktor service manually:

| VARIABLE   | DESCRIPTION                                 | OPTIONS                                  |
| ---------- | ------------------------------------------- | ---------------------------------------- |
| LOG_LEVEL  | decides the log output level, default: info | fatal<br /> error<br /> info<br /> debug |
| HOST_IP    | IPv4 address of docker host, default: ""    | Valid IPv4 address                       |
| REDIS_HOST | FQDN of Redis host, default: HOST_IP        | Valid FQDN                               |
| REDIS_PORT | Port of Redis, default: 6379                | Port Number                              |