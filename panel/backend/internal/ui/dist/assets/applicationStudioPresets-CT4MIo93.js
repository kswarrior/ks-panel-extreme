import{c as e}from"./application-Bm6aN8m3.js";const i=()=>({...e(),name:"Discord Bot",slug:"discord-bot",category:"discord",version:"1.0.0",description:"Node.js Discord bot starter. Runs src/bot.js with BOT_TOKEN from saved env. Requests outbound HTTP so it can reach the Discord gateway.",runtime:"nodejs",mainFile:"src/bot.js",permissionsRequested:[{capability:"outbound_http",access_level:"standard"}],env:{BOT_TOKEN:""},files:[{path:"src/bot.js",content:`// Discord Bot — created by the Application Studio.
// BOT_TOKEN comes from saved env (Configure tab), never hard-code it.
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('Missing BOT_TOKEN env');
  process.exit(1);
}
console.log('Bot starting with token length ' + token.length);
`}]}),t=()=>({...e(),name:"Python Service",slug:"python-service",category:"custom",version:"1.0.0",description:"Python service starter. Runs app/main.py with filesystem read/write for a local data dir.",runtime:"python",mainFile:"app/main.py",permissionsRequested:[{capability:"filesystem",access_level:"read_write"}],env:{DATA_DIR:"./data"},files:[{path:"app/main.py",content:`# Python Service — created by the Application Studio.
import os

data_dir = os.environ.get('DATA_DIR', './data')
print(f'Service starting, data dir: {data_dir}')
`}]}),a=()=>({...e(),name:"Bash Tool",slug:"bash-tool",category:"custom",version:"1.0.0",description:"Minimal bash tool with no permissions requested — safe to activate immediately. Useful for learning the Studio install flow.",runtime:"bash",mainFile:"run.sh",permissionsRequested:[],files:[{path:"run.sh",content:`#!/usr/bin/env bash
# Bash Tool — created by the Application Studio.
set -euo pipefail
echo "Hello from the Application Studio"
`}]}),o=()=>({...e(),name:"Capability Sampler",slug:"capability-sampler",version:"1.0.0",description:"No-code application that requests every available capability. Useful for exercising the grant / activate flow in the admin UI.",runtime:"nodejs",mainFile:"src/main.js",permissionsRequested:[{capability:"network",access_level:"connect"},{capability:"filesystem",access_level:"read_only"},{capability:"outbound_http",access_level:"standard"},{capability:"process_control",access_level:"spawn"}],files:[{path:"src/main.js",content:`// Capability Sampler — created by the Application Studio.
console.log('Sampler running: approve my capabilities on the Applications page, then activate me.');
`}]}),n=[{id:"blank",label:"Blank application",description:"Start from scratch with minimal metadata + no permissions, files or env.",icon:"📄",build:e},{id:"discord-bot",label:"Discord Bot",description:"Node.js bot starter with BOT_TOKEN env + outbound HTTP permission.",icon:"🤖",build:i},{id:"python-service",label:"Python Service",description:"Python starter with a data-dir env default + filesystem permission.",icon:"🐍",build:t},{id:"bash-tool",label:"Bash Tool",description:"Minimal single-file tool with no permissions — activates immediately.",icon:"🧰",build:a},{id:"capability-sampler",label:"Capability Sampler",description:"Requests every capability — exercise the grant/activate UI.",icon:"🧪",build:o}];export{n as A};
