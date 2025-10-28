# Ms_lm_studio

Microservice lm studio.

Depend from Ms_cronjob (use the volume "ms_cronjob-volume" for share the certificate).

## Installation

1. For full build write on terminal:

```
docker compose -f docker-compose.yaml --env-file ./env/local.env build --no-cache \
&& docker compose -f docker-compose.yaml --env-file ./env/local.env up --detach --pull "always"
```

2. For light build (just env variable change) remove the container and write on terminal:

```
docker compose -f docker-compose.yaml --env-file ./env/local.env up --detach --pull "always"
```

## Reset

1. Remove this from the root:

    - .cache
    - .config
    - .local
    - .ms_cronjob-volume
    - .pki
    - .nv
    - .dbus
    - .lmstudio
    - .lmstudio-home-pointer
    - certificate/tls.crt
    - certificate/tls.key
    - certificate/tls.pem

2. Follow the "Installation" instructions.

3. For execute "lm studio" write on terminal:
    ```
    bash script/lm_studio.sh 
    ```