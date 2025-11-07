# Ms_ai

Microservice ai.

Depend from Ms_cronjob (use "ms_cronjob-volume" for share the certificate).
It's possible use personal certificate instead "Ms_cronjob", just put the certificate in ".ms_cronjob-volume" folder before the build.

## Info:

-   Cross platform (Windows, Linux)
-   X11 for WSL2 (Run linux GUI app directly in windows) with full GPU host support.
-   LM studio

## Installation

1. For full build with GPU write on terminal:

```
docker compose -f docker-compose-gpu.yaml --env-file ./env/local.env build --no-cache \
&& docker compose -f docker-compose-gpu.yaml --env-file ./env/local.env up --detach --pull "always"
```

2. For full build with CPU write on terminal:

```
docker compose -f docker-compose-cpu.yaml --env-file ./env/local.env build --no-cache \
&& docker compose -f docker-compose-cpu.yaml --env-file ./env/local.env up --detach --pull "always"
```

3. For light build (just env variable change) remove the container and write on terminal:

```
docker compose -f docker-compose-xxx.yaml --env-file ./env/local.env up --detach --pull "always"
```

## GPU

1. When the container startup are present 3 message that indicate your GPU status:

NVIDIA GeForce RTX 3060 - (Host GPU available)
Host without vulkan support. - (No library vulkan available for your GPU)
OpenGL renderer string: llvmpipe (LLVM 15.0.7, 256 bits) - (OpenGL emulate on CPU)

## Reset

1. Remove this from the root:

    - .cache
    - .config
    - .dbus
    - .lmstudio
    - .npm
    - .nv
    - .pki
    - .lmstudio-home-pointer
    - dist
    - node_modules
    - package-lock.json

2. Follow the "Installation" instructions.

3. For execute "LM studio" GUI write on terminal:

    ```
    bash script/lm_studio.sh 
    ```