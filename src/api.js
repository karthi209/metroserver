require('dotenv').config();
const port = process.env.PORT || 3000;
const axios = require('axios');
const { Client } = require('pg');
const cron = require('node-cron');
const express = require('express');
const serverless = require("serverless-http");
const app = express();
const router = express.Router();

// Define your PostgreSQL connection string
const connectionString = process.env.POSTGRES_CONNECTION_STRING;

const client = new Client({
  connectionString: connectionString,
});

client.connect()
  .then(() => console.log("Successfully connected to PostgreSQL"))
  .catch(err => console.error('Connection error', err.stack));

// Function to get yesterday's date in YYYY-MM-DD format in IST
const getYesterdayDateIST = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  // Convert to IST
  const ISTOffset = 5 * 60 * 60 * 1000 + 30 * 60 * 1000; // IST is UTC+5:30
  const ISTDate = new Date(date.getTime() + ISTOffset);
  return ISTDate.toISOString().split('T')[0];
};

const fetchDataAndStore = async () => {
  try {
    // Fetch data from the API
    const response = await axios.get(process.env.API_ENDPOINT);
    const data = response.data;

    console.log('Fetched Data:', data);

    // Get yesterday's date in IST
    const yesterdayDateIST = getYesterdayDateIST();

    // SQL query with parameter placeholders
    const query = `
      INSERT INTO allTicketCount (
        date, totalTickets, noOfSVC, noOfNCMCcard, noOfMobileQR, noOfStaticQR, 
        noOfPaperQR, noOfPaytmQR, noOfWhatsAppQR, noOfPhonePeQR, totalQrCount,
        noOfPromotionalRideQR, noOfTripcard, noOfTouristCard, noOfToken, noOfGroupCard,
        totalCards, noOfRedBusQR, noOfRapidoQR, noOfJusPayQR, noOfONDCQR
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
    `;

    // Insert data into the database
    await client.query(query, [
      yesterdayDateIST, data.totalTickets, data.noOfSVC, data.noOfNCMCcard, data.noOfMobileQR, data.noOfStaticQR,
      data.noOfPaperQR, data.noOfPaytmQR, data.noOfWhatsAppQR, data.noOfPhonePeQR, data.totalQrCount,
      data.noOfPromotionalRideQR, data.noOfTripcard, data.noOfTouristCard, data.noOfToken, data.noOfGroupCard,
      data.totalCards, data.noOfRedBusQR, data.noOfRapidoQR, data.noOfJusPayQR, data.noOfONDCQR
    ]);

    console.log('Data inserted successfully');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Axios error:', error.toJSON());
    } else {
      console.error('Unexpected error:', error);
    }
  }
};

const fetchDataAndStore2 = async () => {
  try {
    // Fetch data from the API
    const response = await axios.get(process.env.API_ENDPOINT2);
    const data = response.data;

    console.log('Fetched Data:', data);

    // Get yesterday's date in IST
    const yesterdayDateIST = getYesterdayDateIST();

    // Process each line of data
    for (const lineData of data) {
      const { line, categories, series } = lineData;

      for (const serie of series) {
        const { name: seriesName, type: seriesType, data } = serie;

        for (let idx = 0; idx < data.length; idx++) {
          const value = data[idx];
          const station = categories[idx];

          // SQL query with parameter placeholders
          const query = `
            INSERT INTO metro_data (
              line, station, series_name, series_type, data_value, category_index, date
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7
            )
            ON CONFLICT (line, station, series_name, category_index, date) 
            DO UPDATE SET data_value = EXCLUDED.data_value
          `;

          // Insert data into the database
          await client.query(query, [
            line, station, seriesName, seriesType, value, idx, yesterdayDateIST
          ]);
        }
      }
    }

    console.log('Data inserted successfully');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Axios error:', error.toJSON());
    } else {
      console.error('Unexpected error:', error);
    }
  }
};

// Schedule the task to run every day at 1:00 AM IST
cron.schedule('30 18 * * *', () => {
  console.log('Running fetchDataAndStore at 1:00 AM IST');
  fetchDataAndStore();
  fetchDataAndStore2();
});

// Basic express server setup
router.get('/', (req, res) => {
  res.send('Server is running');
});

app.use(`/.netlify/functions/api`, router);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
module.exports.handler = serverless(app);
