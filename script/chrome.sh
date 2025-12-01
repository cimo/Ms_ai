#!/bin/bash

eval "$(dbus-launch --auto-syntax)"

google-chrome --headless --no-sandbox --shm-size=2g --disable-gpu --no-first-run --no-default-browser-check
