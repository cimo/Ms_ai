#!/bin/bash

set -euo pipefail

urlEngine="${MS_AI_URL_ENGINE#*://}"
export urlEngineHost="${urlEngine%%:*}"
export urlEnginePort="${urlEngine##*:}"
export pathEngineModel=${PATH_ROOT}${MS_AI_PATH_ENGINE_MODEL}

mkdir -p "${pathEngineModel}"

# Embedding
model="Qwen/Qwen3-Embedding-0.6B"

modelCompany="${model%/*}"
modelName="${model##*/}"

mkdir -p "${pathEngineModel}${modelCompany}/${modelName}-GGUF/"

if [ ! -f "${pathEngineModel}${modelCompany}/${modelName}-GGUF/${modelName}-F16.gguf" ]
then
    echo "Download: ${modelName}"

    if ! curl -fsSL "https://huggingface.co/${modelCompany}/${modelName}-GGUF/resolve/main/${modelName}-f16.gguf" -o "${pathEngineModel}${modelCompany}/${modelName}-GGUF/${modelName}-F16.gguf"
    then
        echo "Skip ${modelName}: download failed."
    fi
fi

# Assistant
model="unsloth/Qwen3.5-0.8B"

modelCompany="${model%/*}"
modelName="${model##*/}"

mkdir -p "${pathEngineModel}${modelCompany}/${modelName}-GGUF/"

if [ ! -f "${pathEngineModel}${modelCompany}/${modelName}-GGUF/${modelName}-BF16.gguf" ]
then
    echo "Download: ${modelName}"

    if ! curl -fsSL "https://huggingface.co/${modelCompany}/${modelName}-GGUF/resolve/main/${modelName}-BF16.gguf" -o "${pathEngineModel}${modelCompany}/${modelName}-GGUF/${modelName}-BF16.gguf"
    then
        echo "Skip ${modelName}: download failed."
    fi

    echo "Download: ${modelName} - mmproj-BF16"

    if ! curl -fsSL "https://huggingface.co/${modelCompany}/${modelName}-GGUF/resolve/main/mmproj-BF16.gguf" -o "${pathEngineModel}${modelCompany}/${modelName}-GGUF/mmproj-BF16.gguf"
    then
        echo "Skip ${modelName} - mmproj-BF16: download failed."
    fi
fi

# Engine
envsubst '${MS_AI_PATH_CERTIFICATE_KEY},${MS_AI_PATH_CERTIFICATE_CRT},${urlEngineHost},${urlEnginePort},${pathEngineModel}' < "${pathEngineModel}preset.ini.template" > "${pathEngineModel}preset.ini"

"${PATH_ROOT}llamaCpp/build-${DEVICE}/llama-server" --models-preset "${pathEngineModel}preset.ini" &
