# Ms_ai

Microservice ai.

Depend from "Ms_cronjob" (use "ms_cronjob-volume" for share the certificate).
It's possible to use a personal certificate instead of "Ms_cronjob", just add the certificate in the ".ms_cronjob-volume" folders.

## Info:

-   Cross platform (Windows, Linux)
-   WSLg for WSL2 (Run linux GUI app directly in windows) with full nvidia GPU host support.
-   LM studio

## Microsoft

1. Create a file "microsoft.env" in "env" folder and insert:
```
MS_AI_AD_URL_LOGIN=''
MS_AI_AD_URL_REDIRECT=''
MS_AI_AD_SCOPE=''
MS_AI_AD_TENANT=''
MS_AI_AD_CLIENT=''
MS_AI_AD_CLIENT_SECRET=''
```

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

1. Remove this from the root:

    - .cache
    - .config
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
    bash script/lm_studio.sh "gui"
    ```

4. For execute "Chrome" GUI write on terminal:

    ```
    bash script/chrome.sh
    ```