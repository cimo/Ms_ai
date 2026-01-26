#!/bin/bash

countDisplay=98

eval "$(dbus-launch --auto-syntax)"

if [ "${1:-}" = "headless" ]
then
    pkill -f "Xvfb" || true
    pkill -f "X :${countDisplay}" || true

    rm -f /tmp/.X11-unix/X${countDisplay}
    rm -f /tmp/.X${countDisplay}-lock
        
    Xvfb :${countDisplay} -screen 0 1920x1080x24 >/dev/null 2>&1 &
    
    export DISPLAY=:${countDisplay}

    sleep 3
fi

google-chrome --load-extension=${PATH_ROOT}docker/microsoft_sso_crx --no-sandbox --shm-size=2g --disable-dev-shm-usage --disable-gpu --no-first-run --no-default-browser-check
