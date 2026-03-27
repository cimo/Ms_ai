# Ms_ai

Microservice ai.

Depend on "Ms_cronjob" (use "ms_cronjob-volume" to share the certificate).

It's possible to use a custom certificate instead of "Ms_cronjob", just add it to the "certificate" folder before build the container.

## Info:

-   Cross platform (Windows, Linux)
-   WSLg for WSL2 (Run linux GUI app directly in windows) with full nvidia GPU host support.
-   LlamaCpp

## Installation

1. For build and up with GPU write on terminal:

```
bash docker/container_execute.sh "local" "build-up" "gpu"
```

2. For build and up with CPU write on terminal:

```
bash docker/container_execute.sh "local" "build-up" "cpu"
```

3. Just for up write on terminal:

```
bash docker/container_execute.sh "local" "up" "xxx"
```

## GPU

1. When the container start, a message appears that indicates the GPU status:

NVIDIA GeForce RTX 3060 - (Host GPU available)

## Reset

1. Delete this from the root:

    - .cache
    - .config
    - .cuda
    - .local
    - .npm
    - .nv
    - .pki
    - dist
    - node_modules
    - package-lock.json

2. Follow the "Installation" instructions.
