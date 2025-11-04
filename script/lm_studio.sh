#!/bin/bash

eval "$(dbus-launch --auto-syntax)"

"/home/squashfs-root/lm-studio"  --no-sandbox
