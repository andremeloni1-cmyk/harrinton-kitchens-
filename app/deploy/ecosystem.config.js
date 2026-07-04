// PM2 process definition for JoineryFlow.
// Usage: pm2 start deploy/ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: "joineryflow",
      cwd: __dirname + "/..",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        // Keep 6:30am job times in Australian local time regardless of the
        // server's clock. Override BUSINESS_TZ in .env if you're not in Sydney.
        TZ: process.env.TZ || "Australia/Sydney",
        BUSINESS_TZ: process.env.BUSINESS_TZ || "Australia/Sydney",
      },
    },
  ],
};
