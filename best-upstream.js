const express = require('express');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid'); // for generating unique IDs
const { processSalesOrder } = require('./salesorder');
const logger = require('./logger'); // <-- import logger


const app = express();
const port = 3000;
const hostname = "127.0.0.1";

// Import your salesorder function

// Middleware to parse JSON body
app.use(express.json());

// Session middleware setup
app.use(session({
  secret: 'd1117059e53ebd707f6b12c326264e0cb014638560ebd43d54f505fc5fe900a91a90ab50ae4a683c5437c6ea70ab61fe64d80402cf940cf7cfbf0232cd5263dd',   // change to a strong secret!
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 15, // 15 minutes
    secure: false,           // set true if using HTTPS
    httpOnly: true
  }
}));

// Middleware to assign a unique session for each /salesorder request
app.use('/salesorder', (req, res, next) => {
  // Generate a new session ID for this specific request
  const newSessionId = uuidv4();

  // Store it in the session or request object
  req.session.requestId = newSessionId;
  logger.info(`🟢  Session created: ${newSessionId}`);

  // Destroy session after response is sent
  res.on('finish', () => {
    req.session.destroy(err => {
      if (err) {
        logger.error(`❌ Error destroying session ${newSessionId}:`, err);
      } else {
        logger.info(`🧹Session destroyed: ${newSessionId}`);
      }
    });
  });

  next();
});

// Route
app.post('/salesorder',  async (req, res) => {
  try {
    const inputData = req.body;
    const sessionId = req.session.requestId; // get current request's session ID

    logger.info(`Receive request from downstream: ${JSON.stringify(inputData, null, 2)}`);

    // logger.info(`🔹 Processing sales order under session: ${sessionId}`);

    const result = await processSalesOrder(inputData);
    logger.info(`Return response to downstream: ${JSON.stringify(result)}`);

    res.json(result);
  } catch (err) {
    logger.error('Error processing sales order:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Optional: test GET
app.get('/salesorder', (req, res) => {
    res.json({ message: 'SalesOrder route is working!' });
});

app.listen(port, () => {
    console.log(`Server running at http://${hostname}:${port}`);
});


