#!/bin/bash

urlOpenAi="${MS_AI_URL_OPEN_AI#*://}"
urlOpenAiHost="${urlOpenAi%%:*}"
urlOpenAiPort="${urlOpenAi##*:}"

pathLmStudio="/home/squashfs-root/lm-studio"
pathLms="/home/app/.lmstudio/bin/lms"

eval "$(dbus-launch --auto-syntax)"

if [ "${1:-}" = "headless" ]
then
    pkill -f "Xvfb" || true
    pkill -f "X :99" || true

    rm -f /tmp/.X11-unix/X99
    rm -f /tmp/.X99-lock
        
    Xvfb :99 -screen 0 1024x768x24 &
    export DISPLAY=:99

    sleep 3
fi

"${pathLmStudio}" --no-sandbox --shm-size=2g --disable-dev-shm-usage --disable-gpu --no-first-run --no-default-browser-check >> ${PATH_ROOT}${MS_AI_PATH_LOG}lm_studio.log 2>&1 &

if [ -x "${pathLms}" ]
then
    sleep 3

    "${pathLms}" server start --bind ${urlOpenAiHost} --port ${urlOpenAiPort}

    sleep 3

    read -r -a modelList <<< "$(printf '%s' "${MS_AI_MODEL}" | tr -d '[]" ' | tr ',' ' ')"

    for model in ${modelList[@]}
    do
        sleep 3

        "${pathLms}" get "${model}@q8_0" --yes

        sleep 3

        "${pathLms}" load "${model}"
    done
fi
