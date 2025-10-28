const express = require('express');
const session = require('express-session');
const { generateTokenForClient, revokeByClientName } = require('./auth');
const founderhq = require('./founderhq');
const logger = require('./logger'); // <-- import logger

const app = express();
const port = 2000;
const hostname = "0.0.0.0" ;

// Middleware to parse JSON body
app.use(express.json());

// Add this route for generating tokens
app.get('/generate-token/:client', async (req, res) => {
  try {
    const { client } = req.params;
    const result = await generateTokenForClient(client);
    res.json({
      message: 'Token generated successfully',
      client: client,
      token: result.token,
      jti: result.jti,
      expires_at: result.dbRecord.expires_at
    });
  } catch (err) {
    logger.downstream.error('Error generating token:', err);
    res.status(500).json({
      message: 'Error generating token',
      error: err.message
    });
  }
});

// Revoke all tokens for a client
app.post('/revoke-token/:client', async (req, res) => {
  try {
    const { client } = req.params;
    await revokeByClientName(client);
    res.json({ message: `All tokens for client "${client}" have been revoked.` });
  } catch (err) {
    logger.downstream.error('Error revoking token:', err);
    res.status(500).json({ message: 'Error revoking token', error: err.message });
  }
});


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


// routes
app.use('/', founderhq);

// CREATE A LOG WHEN THE APPLICATION JUST STARTED TO RUN
app.listen(port, hostname, () => {
  const message = `BEST Downstream server started and running at http://${hostname}:${port}`;
  logger.downstream.info(message);           // write to your log file
});


