#!/bin/bash

cd "${PATH_ROOT}mcp_server/"
    
rm -rf "${PATH_ROOT}node_modules/" "${PATH_ROOT}package-lock.json"
    
npm install

if [ "${1}" = "local" ]
then
    npm run execute >> "${PATH_ROOT}${MS_AI_PATH_LOG}mcp.log" 2>&1 &
else
    npm run build
    
    node "${PATH_ROOT}mcp_server/dist/src/Main.js" >> "${PATH_ROOT}${MS_AI_PATH_LOG}mcp.log" 2>&1 &
fi