#!/bin/bash

urlOpenAi="${MS_AI_URL_OPEN_AI#*://}"
urlOpenAiHost="${urlOpenAi%%:*}"
urlOpenAiPort="${urlOpenAi##*:}"

pathLmStudio="/home/squashfs-root/lm-studio"
pathLms="${PATH_ROOT}.lmstudio/bin/lms"
pathBackend="${PATH_ROOT}.lmstudio/extensions/backends/"
pathBackendVendor="${PATH_ROOT}.lmstudio/extensions/backends/vendor/"

if [ "${1}" = "gui" ]
then
    pkill -f "${pathLmStudio}"
    pkill -f "${pathLms}"

    "${pathLmStudio}" --enable-features=UseOzonePlatform --ozone-platform=wayland --no-sandbox --disable-dev-shm-usage  >> "${PATH_ROOT}${MS_AI_PATH_LOG}lm_studio.log" 2>&1 &
else
    curl -fsSL https://lmstudio.ai/install.sh | bash
fi

while true
do
    sleep 3

    if [[ -d "${pathBackend}llama.cpp-linux-x86_64-avx2-2.0.1/" \
    && -d "${pathBackend}llama.cpp-linux-x86_64-nvidia-cuda-avx2-2.0.1/" \
    && -d "${pathBackend}llama.cpp-linux-x86_64-vulkan-avx2-2.0.1/" ]]
    then
        if [[ -d "${pathBackendVendor}_amphibian/" \
        && -d "${pathBackendVendor}linux-llama-cuda-vendor-v1/" \
        && -d "${pathBackendVendor}linux-llama-vulkan-vendor-v1/" ]]
        then
            break
        fi
    fi
done

"${pathLms}" server start --bind ${urlOpenAiHost} --port ${urlOpenAiPort}

read -r -a modelList <<< "$(printf '%s' "${MS_AI_MODEL}" | tr -d '[]" ' | tr ',' ' ')"

for model in "${modelList[@]}"
do
    echo "Model: ${model}"

    download=$(curl -s ${MS_AI_URL_OPEN_AI}/api/v1/models/download -H "Content-Type: application/json" -d "{\"model\": \"https://huggingface.co/${model}\", \"quantization\": \"Q8_0\"}")

    jobId=$(echo ${download} | jq -r '.job_id')

    echo "Job ID: ${jobId}"

    if [ -n "${jobId}" ] && [ "${jobId}" != "null" ]
    then
        status="start"

        while [ "${status}" != "completed" ]
        do
            sleep 3

            status=$(curl -s ${MS_AI_URL_OPEN_AI}/api/v1/models/download/status/${jobId} | jq -r '.status')

            echo "Status: ${status}"

            if [ -z "${status}" ] || [ "${status}" = "null" ]
            then
                break
            fi
        done
    fi

    modelIdentifierFolder=$(echo "${model}" | sed 's/-GGUF//g' | sed 's|.*/||')

    echo "Model folder: ${modelIdentifierFolder}"

    pathModel="/home/app/.lmstudio/models/${model}/${modelIdentifierFolder}-Q8_0.gguf"

    while [ ! -f "${pathModel}" ]
    do
        sleep 3

        if [ -z "${jobId}" ] || [ "${jobId}" = "null" ]
        then
            break
        fi
    done

    if [ -f "${pathModel}" ]
    then
        sleep 3
        
        modelIdentifier=$(echo "${model}" | sed 's/-GGUF//g' | sed 's|.*/||' | tr '[:upper:]' '[:lower:]')
        
        curl -s ${MS_AI_URL_OPEN_AI}/api/v1/models/load -H "Content-Type: application/json" -d "{\"model\": \"${modelIdentifier}\"}"

        echo ""
    fi
done
