#!/bin/bash

if [ "${1}" = "gui" ]
then
    google-chrome --enable-features=UseOzonePlatform --ozone-platform=wayland --no-sandbox --disable-dev-shm-usage --no-first-run --no-default-browser-check --hide-crash-restore-bubble >> "${PATH_ROOT}${MS_AI_PATH_LOG}chrome.log" 2>&1 &
else
    #export DISPLAY=:${2}

    #rm -f "/tmp/.X11-unix/X${2}" || true;
    #rm -f "/tmp/.X${2}-lock" || true;

    #kill -9 $(ps -ef | grep "Xvfb :${2}" | grep -v grep | awk '{print $2}')

    #Xvfb :${2} -screen 0 1920x1080x24 >> "${PATH_ROOT}${MS_AI_PATH_LOG}xvfb.log" 2>&1 &

    #sleep 3

    node "${PATH_ROOT}script/chrome.js" "${3}" >/dev/null 2>&1 &
fi