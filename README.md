# Ms_ai

Microservice ai.

Depend from "Ms_cronjob" (use "ms_cronjob-volume" for share the certificate).
It's possible to use a personal certificate instead of "Ms_cronjob", just add the certificate in the ".ms_cronjob-volume" folders.

## Info:

-   Cross platform (Windows, Linux)
-   X11 for WSL2 (Run linux GUI app directly in windows) with full nvidia GPU host support.
-   LM studio

## Secret

1. Create a file "local.env.secret" in "env" folder and put there all your secret before build the container.

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
    - .local
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

4. For execute "Chrome" GUI write on terminal:

    ```
    bash script/chrome.sh
    ```