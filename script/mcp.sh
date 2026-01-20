#!/bin/bash

if [ "${1:-}" = "node" ]
then
    node ${PATH_ROOT}mcp_server/dist/src/Main.js
else
    cd ${PATH_ROOT}mcp_server/
    
    rm -rf ${PATH_ROOT}node_modules/ ${PATH_ROOT}package-lock.json
    
    npm install
    npm run execute >> ${PATH_ROOT}${MS_AI_PATH_LOG}mcp.log 2>&1 &
fi