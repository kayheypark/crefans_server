const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const runtime=path.resolve('.local/platform.env');
if(!fs.existsSync(runtime))throw new Error('Copy infra/platform/runtime.env.example to .local/platform.env and configure a development database.');
require('dotenv').config({path:runtime,override:true});
const database=new URL(process.env.DATABASE_URL);if(database.hostname!=='127.0.0.1'||database.port!=='3307'||database.pathname!=='/crefans_platform_dev')throw new Error('dev:platform only accepts the isolated loopback platform database.');
const child=spawn(process.execPath,['dist/src/platform/main.js'],{env:process.env,stdio:'inherit'});
for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code||0));
