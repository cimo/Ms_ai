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

if [ ! -f "${pathEngineModel}${modelCompany}/${modelName}-GGUF/Q4_0.gguf" ]
then
    echo "Download: ${modelName}"

    if ! curl -fsSL "https://huggingface.co/${modelCompany}/${modelName,,}-GGUF/resolve/main/${modelName,,}-Q4_0.gguf" -o "${pathEngineModel}${modelCompany}/${modelName}-GGUF/Q4_0.gguf"
    then
        echo "Skip ${modelName}: download failed."
    fi
fi

# Assistant
modelList=(
    "unsloth/Qwen3.5-9B"
    "unsloth/Qwen3.5-2B"
)

for model in "${modelList[@]}"
do
    modelCompany="${model%/*}"
    modelName="${model##*/}"
    modelDir="${pathEngineModel}${modelCompany}/${modelName}-GGUF"

    mkdir -p "${modelDir}"

    if [ ! -f "${modelDir}/Q4_0.gguf" ]
    then
        echo "Download: ${modelName}"

        if ! curl -fsSL "https://huggingface.co/${modelCompany}/${modelName}-GGUF/resolve/main/${modelName}-Q4_0.gguf" -o "${modelDir}/Q4_0.gguf"
        then
            echo "Skip ${modelName}: download failed."
        fi

        echo "Download: ${modelName} - mmproj-F16"

        if ! curl -fsSL "https://huggingface.co/${modelCompany}/${modelName}-GGUF/resolve/main/mmproj-F16.gguf" -o "${modelDir}/mmproj-F16.gguf"
        then
            echo "Skip ${modelName} - mmproj-F16: download failed."
        fi
    fi
done

# Engine
envsubst '${pathEngineModel}' < "${pathEngineModel}preset_local_${DEVICE}.ini.template" > "${pathEngineModel}preset.ini"

"${PATH_ROOT}llamaCpp/bin/llama-server" \
--host ${urlEngineHost} \
--port ${urlEnginePort} \
--ssl-key-file ${MS_AI_PATH_CERTIFICATE_KEY} \
--ssl-cert-file ${MS_AI_PATH_CERTIFICATE_CRT} \
--models-max 3 \
--no-webui \
--threads $(( $(nproc) / 2 )) \
--models-preset "${pathEngineModel}preset.ini" >> "${PATH_ROOT}${MS_AI_PATH_LOG}llamaCpp.log" 2>&1 &

tail -f "${PATH_ROOT}${MS_AI_PATH_LOG}llamaCpp.log" > /dev/null 2>&1 &

until curl -fsSL "${MS_AI_URL_ENGINE}/health" > /dev/null 2>&1
do
    sleep 3
done

curl -fsSL "${MS_AI_URL_ENGINE}/models/load" -H "Content-Type: application/json" -d '{"model": "embeddinggemma-300M-Q4_0"}' > /dev/null 2>&1

if [ "${DEVICE}" = "gpu" ]
then
    modelAssistant="${modelList[0]##*/}-Q4_0"
else
    modelAssistant="${modelList[1]##*/}-Q4_0"
fi

curl -fsSL "${MS_AI_URL_ENGINE}/models/load" -H "Content-Type: application/json" -d "{\"model\": \"${modelAssistant}\"}" > /dev/null 2>&1

echo "Engine ready."
