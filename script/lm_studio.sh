#!/bin/bash

p1=$(printf '%s' "${1}" | xargs)

if [ "$#" -lt 1 ]
then
    echo "lm_studio.sh - Missing parameter."

    exit 1
fi

parameter1="${1}"

urlEngine="${MS_AI_URL_ENGINE#*://}"
urlEngineHost="${urlEngine%%:*}"
urlEnginePort="${urlEngine##*:}"

pathLmStudio="/home/squashfs-root/lm-studio"
pathLms="${PATH_ROOT}.lmstudio/bin/lms"
pathBackend="${PATH_ROOT}.lmstudio/extensions/backends/"
pathBackendVendor="${PATH_ROOT}.lmstudio/extensions/backends/vendor/"
pathDownloadModel="${PATH_ROOT}.lmstudio/download/"

waitForModel() {
    local needle="${1}"
    local timeout=60
    local start end

    start=$(date +%s)
    end=$((start + timeout))

    echo "Waiting for model: ${1}"

    while ! "${pathLms}" ls 2>/dev/null | grep -iFq "${1}"
    do
        if [ "$(date +%s)" -ge "${end}" ]; then
            echo "Timeout reached for model: ${1}"

            return 1
        fi

        sleep 3
    done

    return 0
}


if [ "${parameter1}" = "gui" ]
then
    pkill -f "${pathLmStudio}"
    pkill -f "${pathLms}"

    "${pathLmStudio}" --no-sandbox --disable-dev-shm-usage >> "${PATH_ROOT}${MS_AI_PATH_LOG}lm_studio.log" 2>&1 &
else
    curl -fsSL https://lmstudio.ai/install.sh | bash
fi

while true
do
    sleep 3
    
    if compgen -G "${pathBackend}llama.cpp-linux-x86_64-avx2-"*/ >/dev/null \
    && compgen -G "${pathBackend}llama.cpp-linux-x86_64-nvidia-cuda-avx2-"*/ >/dev/null \
    && compgen -G "${pathBackend}llama.cpp-linux-x86_64-vulkan-avx2-"*/ >/dev/null
    then
        if compgen -G "${pathBackendVendor}_amphibian"*/ >/dev/null \
        && compgen -G "${pathBackendVendor}linux-llama-cuda-vendor-"*/ >/dev/null \
        && compgen -G "${pathBackendVendor}linux-llama-vulkan-vendor-"*/ >/dev/null
        then
            break
        fi
    fi
done

while lsof "${pathLms}" >/dev/null 2>&1
do
    sleep 1
done

sleep 3

"${pathLms}" server start --bind ${urlEngineHost} --port ${urlEnginePort}

read -r -a modelList <<< "$(printf '%s' "${MS_AI_MODEL}" | tr -d '[]" ' | tr ',' ' ')"

for model in "${modelList[@]}"
do
    mkdir -p "${pathDownloadModel}"

    echo "Model: ${model}"

    download=$(curl -fsSL --retry 3 -o "${pathDownloadModel}${model}.gguf" "https://huggingface.co/unsloth/${model}-GGUF/resolve/main/${model}-Q8_0.gguf?download=true")

    if [ "${model}" = "Qwen3.5-0.8B" ]
    then
        echo "Model: mmproj-BF16"

        downloadSub=$(curl -fsSL --retry 3 -o "${pathDownloadModel}mmproj-BF16.gguf" "https://huggingface.co/unsloth/${model}-GGUF/resolve/main/mmproj-BF16.gguf?download=true")
    fi
done

for model in "${pathDownloadModel}"*.gguf
do
    sleep 3

    name="$(basename "${model}" .gguf)"

    if [[ "${name}" == *mmproj* ]]
    then
        continue
    fi

    echo "Import: ${name}"
    
    if [ "${name}" = "Qwen3.5-0.8B" ]
    then
        "${pathLms}" import -y --copy --user-repo "unsloth/${name}-GGUF" "${model}"
        "${pathLms}" import -y --copy --user-repo "unsloth/${name}-GGUF" "${pathDownloadModel}mmproj-BF16.gguf"
    else
        "${pathLms}" import -y --copy --user-repo "unsloth/${name}-GGUF" "${model}"
    fi
done

if waitForModel "qwen3.5-0.8b"
then
    "${pathLms}" load "qwen3.5-0.8b"
fi


