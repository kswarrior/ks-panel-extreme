console.log("[STUB BOT] starting pid "+process.pid);
setTimeout(()=>{ console.log("[STUB BOT] exiting with 1 to simulate crash"); process.exit(1); }, 1500);
