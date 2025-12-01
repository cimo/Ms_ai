#!/bin/bash

eval "$(dbus-launch --auto-syntax)"

"/home/squashfs-root/lm-studio" --no-sandbox
#"/home/squashfs-root/resources/app/.webpack/lms" load qwen/qwen3-4b-2507
