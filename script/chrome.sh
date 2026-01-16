#!/bin/bash

if [ ${1} = "headless" ]
then
    google-chrome --no-sandbox --headless --shm-size=2g --disable-dev-shm-usage --disable-gpu --no-first-run --no-default-browser-check > /dev/null 2>&1 &
else
    eval "$(dbus-launch --auto-syntax)"

    google-chrome --no-sandbox --shm-size=2g --disable-dev-shm-usage --disable-gpu --no-first-run --no-default-browser-check
fi
