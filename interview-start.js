// Do not load .env or carry provider/database settings into the lab process.
import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['server.js'],{
 cwd:new URL('.',import.meta.url),
 env:{PATH:process.env.PATH,INTERVIEW_LAB:'true',HOST:'127.0.0.1',PORT:process.env.PORT||'3001'},
 stdio:'inherit'
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
