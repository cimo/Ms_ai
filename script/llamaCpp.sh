#!/bin/bash

urlEngine="${MS_AI_URL_ENGINE#*://}"
urlEngineHost="${urlEngine%%:*}"
urlEnginePort="${urlEngine##*:}"
export pathEngineModel="${PATH_ROOT}${MS_AI_PATH_ENGINE_MODEL}"

mkdir -p "${pathEngineModel}"

# Assistant
modelList=(
    "qwen3.5-9B"
    "qwen3.5-2B"
)

for model in "${modelList[@]}"
do
    sizeModel="${model##*-}"
    pathModel="${pathEngineModel}qwen3.5-${sizeModel}-GGUF/"

    mkdir -p "${pathModel}"

    if [ ! -f "${pathModel}Q4_0.gguf" ]
    then
        echo "Download: ${model} - Q4_0"

        if ! curl -fsSL "https://huggingface.co/cimo001/qwen/resolve/main/3.5/gguf/${sizeModel}/Q4_0.gguf" -o "${pathModel}Q4_0.gguf"
        then
            echo "Skip ${model} - Q4_0: download failed."

            rm -f "${pathModel}Q4_0.gguf"
        fi

        echo "Download: ${model} - mmproj-F16"

        if ! curl -fsSL "https://huggingface.co/cimo001/qwen/resolve/main/3.5/gguf/${sizeModel}/mmproj-F16.gguf" -o "${pathModel}mmproj-F16.gguf"
        then
            echo "Skip ${model} - mmproj-F16: download failed."

            rm -f "${pathModel}mmproj-F16.gguf"
        fi
    fi
done

# Engine
envsubst '${pathEngineModel}' < "${pathEngineModel}preset_local_${DEVICE}.ini.template" > "${pathEngineModel}preset.ini"

"${PATH_ROOT}llamaCpp/bin/llama-server" \
--host "${urlEngineHost}" \
--port "${urlEnginePort}" \
--ssl-key-file "${MS_AI_PATH_CERTIFICATE_KEY}" \
--ssl-cert-file "${MS_AI_PATH_CERTIFICATE_CRT}" \
--models-max 1 \
--no-webui \
--threads $(( $(nproc) / 2 )) \
--models-preset "${pathEngineModel}preset.ini" >> "${PATH_ROOT}${MS_AI_PATH_LOG}llamaCpp.log" 2>&1 &

tail -f "${PATH_ROOT}${MS_AI_PATH_LOG}llamaCpp.log" > "/dev/null" 2>&1 &

until curl -fsSL "${MS_AI_URL_ENGINE}/health" > "/dev/null" 2>&1
do
    sleep 3
done

if [ "${DEVICE}" = "gpu" ]
then
    modelAssistant="${modelList[0]}-Q4_0"
else
    modelAssistant="${modelList[1]}-Q4_0"
fi

curl -fsSL "${MS_AI_URL_ENGINE}/models/load" -H "Content-Type: application/json" -d "{\"model\": \"${modelAssistant}\"}" > "/dev/null" 2>&1

echo "Engine ready."
