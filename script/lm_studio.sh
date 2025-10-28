#!/bin/bash

eval "$(dbus-launch --auto-syntax)"

chmod +x ${PATH_ROOT}docker/LM-Studio-0.3.30-2-x64.AppImage
${PATH_ROOT}docker/LM-Studio-0.3.30-2-x64.AppImage --no-sandbox