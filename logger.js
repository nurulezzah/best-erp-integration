const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');

// Log directory (default to ./logs or env var)
const logDir = process.env.LOG_DIR || path.join(__dirname, 'logs');

// linux env
// const logDir = '/var/log/best-erp-integration';


// Ensure log folder exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Daily rotation config
const infoRotate  = new transports.DailyRotateFile({
  dirname: logDir,
  filename: 'erp-log-info-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
//   zippedArchive: true,
//   maxSize: '10m',
//   maxFiles: '14d',
  level: 'info'
});




const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(info => `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message}`)
  ),
  transports: [
    infoRotate
  ]
});




// --- ⚡ Lazy error log creation (only when first error happens) ---
let errorTransportAdded = false;
logger.on('error', (err) => {
  if (!errorTransportAdded) {
    const errorRotate = new transports.DailyRotateFile({
      dirname: logDir,
      filename: 'erp-error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
    //   zippedArchive: true,
    //   maxSize: '10m',
    //   maxFiles: '30d',
      level: 'error'
    });
    logger.add(errorRotate);
    errorTransportAdded = true;
  }
});


module.exports = logger;
