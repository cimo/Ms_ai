#!/bin/bash

urlEngine="${MS_AI_URL_ENGINE#*://}"
urlEngineHost="${urlEngine%%:*}"
urlEnginePort="${urlEngine##*:}"
export pathEngineModel=${PATH_ROOT}${MS_AI_PATH_ENGINE_MODEL}

mkdir -p "${pathEngineModel}"

# Embedding
model="unsloth/embeddinggemma-300M"

modelCompany="${model%/*}"
modelName="${model##*/}"

mkdir -p "${pathEngineModel}${modelCompany}/${modelName}-GGUF/"

if [ ! -f "${pathEngineModel}${modelCompany}/${modelName}-GGUF/${modelName}-BF16.gguf" ]
then
    echo "Download: ${modelName}"

    if ! curl -fsSL "https://huggingface.co/${modelCompany}/${modelName,,}-GGUF/resolve/main/${modelName}-BF16.gguf" -o "${pathEngineModel}${modelCompany}/${modelName}-GGUF/${modelName}-BF16.gguf"
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
envsubst '${pathEngineModel}' < "${pathEngineModel}preset_local_${DEVICE}.ini.template" > "${pathEngineModel}preset.ini"

"${PATH_ROOT}llamaCpp/bin/llama-server" \
--host ${urlEngineHost} \
--port ${urlEnginePort} \
--ssl-key-file ${MS_AI_PATH_CERTIFICATE_KEY} \
--ssl-cert-file ${MS_AI_PATH_CERTIFICATE_CRT} \
--models-max 2 \
--no-webui \
--threads 2 \
--models-preset "${pathEngineModel}preset.ini" >> "${PATH_ROOT}${MS_AI_PATH_LOG}llamaCpp.log" 2>&1 &

tail -f "${PATH_ROOT}${MS_AI_PATH_LOG}llamaCpp.log" > /dev/null 2>&1 &

until curl -fsSL "${MS_AI_URL_ENGINE}/health" > /dev/null 2>&1
do
    sleep 3
done

curl -fsSL "${MS_AI_URL_ENGINE}/models/load" -H "Content-Type: application/json" -d '{"model": "embeddinggemma-300M-BF16"}' > /dev/null 2>&1

curl -fsSL "${MS_AI_URL_ENGINE}/models/load" -H "Content-Type: application/json" -d '{"model": "Qwen3.5-0.8B-BF16"}' > /dev/null 2>&1

echo "Engine ready."
