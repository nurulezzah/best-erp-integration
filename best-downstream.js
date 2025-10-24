const express = require('express');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid'); // for generating unique IDs
const {processReq} = require('./founderhq-so')
const {getInventory} = require('./founderhq-inventory')

const logger = require('./logger'); // <-- import logger


const app = express();
const port = 2000;
const hostname = "0.0.0.0" ;

// Import your salesorder function

// Middleware to parse JSON body
app.use(express.json());

// Session middleware setup
app.use(session({
  secret: '32da1215356e1ffc4eaa32f3d3daace837c4f763eb0972d1bca6e14f6cacc96ef9ca35f5f4eedebabd72d725375d5aa43d8243c2a96588768e655d37dd302cdc',   
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 15, // 15 minutes
    secure: false,           // set true if using HTTPS
    httpOnly: true
  }
}));



function sessionHandler(routeName) {
  return (req, res, next) => {
    const sessionId = uuidv4();
    req.session.requestId = sessionId;
    logger.downstream.info(`Session created for ${routeName}: ${sessionId}`);

    res.on('finish', () => {
      req.session.destroy(err => {
        if (err) {
          logger.downstream.error(`Error destroying session ${sessionId}:`, err);
        } else {
          logger.downstream.info(`Session destroyed for ${routeName}: ${sessionId}`);
        }
      });
    });

    next();
  };
}

// Apply middleware for both routes
app.use('/createOrder', sessionHandler('founderhq-so'));
app.use('/getInventory', sessionHandler('founderhq-inventory'));

// Route
app.post('/createOrder',  async (req, res) => {
  try {
    const inputData = req.body;

    logger.downstream.info(`Receive request from client: ${JSON.stringify(inputData, null, 2)}`);


    const result = await processReq(inputData);
    logger.downstream.info(`Return response to client: ${JSON.stringify(result)}`);

    res.json(result);
  } catch (err) {
    logger.downstream.error('Error processing create order:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});



app.post('/getInventory',  async (req, res) => {
  try {
    const inputData = req.body;

    logger.downstream.info(`Receive request from client: ${JSON.stringify(inputData, null, 2)}`);


    const result = await getInventory(inputData);
    logger.downstream.info(`Return response to client: ${JSON.stringify(result)}`);

    res.json(result);
  } catch (err) {
    logger.downstream.error('Error processing get inventory:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// // Optional: test GET
app.get('/createOrder', (req, res) => {
    res.json({ message: 'createOrder route is working!' });
});

app.get('/getInventory', (req, res) => {
    res.json({ message: 'Get Inventory route is working!' });
});

// CREATE A LOG WHEN THE APPLICATION JUST STARTED TO RUN
app.listen(port, hostname, () => {
  const message = `BEST Downstream server started and running at http://${hostname}:${port}`;
  logger.downstream.info(message);           // write to your log file
});


