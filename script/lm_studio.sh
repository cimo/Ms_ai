#!/bin/bash

urlOpenAi="${MS_AI_URL_OPEN_AI#*://}"
urlOpenAiHost="${urlOpenAi%%:*}"
urlOpenAiPort="${urlOpenAi##*:}"

pathLmStudio="/home/squashfs-root/lm-studio"
pathLms="${PATH_ROOT}.lmstudio/bin/lms"

sourcePath=""
targetPath="${PATH_ROOT}.cuda/"

if [ "${1}" = "gui" ]
then
    mainPid=$(ps -eo pid,cmd | grep '[l]m-studio --enable-features' | awk '{print $1}')

    kill -9 ${mainPid}

    "${pathLmStudio}" --enable-features=UseOzonePlatform --ozone-platform=wayland --no-sandbox --disable-dev-shm-usage >> ${PATH_ROOT}${MS_AI_PATH_LOG}lm_studio.log 2>&1 &
else
    curl -fsSL https://lmstudio.ai/install.sh | bash
fi

while [ ! -f "${pathLms}" ]
do
    sleep 3
done

"${pathLms}" server start --bind ${urlOpenAiHost} --port ${urlOpenAiPort}

read -r -a modelList <<< "$(printf '%s' "${MS_AI_MODEL}" | tr -d '[]" ' | tr ',' ' ')"

for model in "${modelList[@]}"
do
    echo "Model: ${model}"

    modelIdentifier=$(echo "${model}" | sed 's/-GGUF//g' | sed 's|.*/||' | tr '[:upper:]' '[:lower:]')

    download=$(curl -s ${MS_AI_URL_OPEN_AI}/api/v1/models/download -H "Content-Type: application/json" -d "{\"model\": \"https://huggingface.co/${model}\", \"quantization\": \"Q8_0\"}")

    jobId=$(echo ${download} | jq -r '.job_id')

    echo "Job ID: ${jobId}"

    if [ "${jobId}" != "null" ]
    then
        status="start"

        while [ "${status}" != "completed" ]
        do
            sleep 3

            status=$(curl -s ${MS_AI_URL_OPEN_AI}/api/v1/models/download/status/${jobId} | jq -r '.status')

            echo "Status: ${status}"
        done
    fi

    modelIdentifierFolder=$(echo "${model}" | sed 's/-GGUF//g' | sed 's|.*/||')

    while [ ! -f "/home/app/.lmstudio/models/${model}/${modelIdentifierFolder}-Q8_0.gguf" ]
    do
        sleep 3
    done

    sleep 3

    curl -s ${MS_AI_URL_OPEN_AI}/api/v1/models/load -H "Content-Type: application/json" -d "{\"model\": \"${modelIdentifier}\"}"

    echo ""
done
