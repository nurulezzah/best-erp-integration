const express = require('express');
const app = express();
const port = 3000;

// Import your salesorder function
const { processSalesOrder } = require('./salesorder');

// Middleware to parse JSON body
app.use(express.json());

// Route
app.post('/salesorder',  async (req, res) => {
  try {
    const inputData = req.body;
    const result = await processSalesOrder(inputData);
    res.json(result);
  } catch (err) {
    console.error('Error processing sales order:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Optional: test GET
app.get('/salesorder', (req, res) => {
    res.json({ message: 'SalesOrder route is working!' });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


