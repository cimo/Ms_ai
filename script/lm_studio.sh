#!/bin/bash

if [ "${1:-}" = "headless" ]
then
    pkill -f "Xvfb" || true
    pkill -f "X :99" || true

    rm -f /tmp/.X11-unix/X99
    rm -f /tmp/.X99-lock
        
    Xvfb :99 -screen 0 1024x768x24 &
    export DISPLAY=:99

    "/home/squashfs-root/lm-studio" --no-sandbox --headless --shm-size=2g --disable-dev-shm-usage --disable-gpu --no-first-run --no-default-browser-check >> ${PATH_ROOT}${MS_AI_PATH_LOG}lmstudio.log 2>&1 &
else
    eval "$(dbus-launch --auto-syntax)"

    "/home/squashfs-root/lm-studio" --no-sandbox --shm-size=2g --disable-dev-shm-usage --disable-gpu --no-first-run --no-default-browser-check >> ${PATH_ROOT}${MS_AI_PATH_LOG}lmstudio.log 2>&1 &
fi

sleep 3

"/home/app/.lmstudio/bin/lms" server start --bind 127.0.0.1 --port 1234

sleep 3

modelList=$(printf '%s' "${MS_AI_MODEL}" | tr -d '[]" ' | tr ',' ' ')

for model in ${modelList}
do
    sleep 3

    "/home/app/.lmstudio/bin/lms" load ${model}
done
