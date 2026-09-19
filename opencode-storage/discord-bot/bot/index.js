console.log("[STABLE BOT] running pid "+process.pid);
// keep alive until killed
setInterval(()=> console.log("[STABLE BOT] heartbeat"), 2000);
