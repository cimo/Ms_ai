#!/bin/bash

countDisplay=${1}

eval "$(dbus-launch --auto-syntax)"

if [ "${3:-}" = "headless" ]
then
    rm -f /tmp/.X11-unix/X${countDisplay} || true;
    rm -f /tmp/.X${countDisplay}-lock || true;

    kill -9 $(ps -ef | grep "Xvfb :${countDisplay}" | grep -v grep | awk '{print $2}')

    export DISPLAY=:${countDisplay}

    Xvfb :${countDisplay} -screen 0 1920x1080x24 >> ${PATH_ROOT}${MS_AI_PATH_LOG}xvfb.log 2>&1 &

    sleep 3
fi

node ${PATH_ROOT}script/chrome.js "${2}" >/dev/null 2>&1 &
