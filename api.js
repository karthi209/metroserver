require("dotenv").config();
const port = process.env.PORT || 3000;
const axios = require("axios");
const { Client } = require("pg");
const cron = require("node-cron");
const express = require("express");
const serverless = require("serverless-http");
const app = express();
const router = express.Router();

// Define your PostgreSQL connection string
const connectionString = process.env.POSTGRES_CONNECTION_STRING;

const client = new Client({
  connectionString: connectionString,
});

client
  .connect()
  .then(() => console.log("Successfully connected to PostgreSQL"))
  .catch((err) => console.error("Connection error", err.stack));

// Function to get yesterday's date in YYYY-MM-DD format in IST
const getYesterdayDateIST = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  // Convert to IST
  const ISTOffset = 5 * 60 * 60 * 1000 + 30 * 60 * 1000; // IST is UTC+5:30
  const ISTDate = new Date(date.getTime() + ISTOffset);
  return ISTDate.toISOString().split("T")[0];
};

const fetchDataAndStore = async () => {
  try {
    console.log("Fetching Data from allTicketCount API");

    // Fetch data from the API
    const response = await axios.get(process.env.API_ENDPOINT);
    const data = response.data;

    console.log("Fetched Data from allTicketCount API");

    // Get yesterday's date in IST
    const yesterdayDateIST = getYesterdayDateIST();

    // SQL query with parameter placeholders
    const query = `
      INSERT INTO allTicketCount (
        date, ridership
      ) VALUES (
        $1, $2
      )
      ON CONFLICT (date) 
      DO UPDATE SET ridership = EXCLUDED.ridership 
    `;

    // Insert data into the database
    await client.query(query, [yesterdayDateIST, data.totalTickets]);

    console.log(
      "Data from allTicketCount API inserted successfully into database table allticketcount"
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Axios error:", error.toJSON());
    } else {
      console.error("Unexpected error:", error);
    }
  }
};

const fetchDataAndStore2 = async () => {
  try {
    console.log("Fetching data from allstations API");
    // Fetch data from the API
    const response = await axios.get(process.env.API_ENDPOINT2);
    const data = response.data;

    console.log("Fetched Data from allstations API");

    // Get yesterday's date in IST
    const yesterdayDateIST = getYesterdayDateIST();

    // Process each line of data
    for (const lineData of data) {
      const { line, categories, series } = lineData;

      // Check if categories and series are defined
      if (!categories || !series) {
        console.error("Categories or series is undefined:", lineData);
        continue; // Skip this lineData if categories or series are not defined
      }

      for (const serie of series) {
        const { name: seriesName, type: seriesType, data } = serie;

        // Process only the series with the name "Total"
        if (seriesName !== "Total") {
          continue; // Skip this series if the name is not "Total"
        }

        // Check if data is defined
        if (!data) {
          console.error("Data is undefined for series:", serie);
          continue; // Skip this series if data is not defined
        }

        for (let idx = 0; idx < data.length; idx++) {
          const value = data[idx];
          const station = categories[idx];

          // Check if station is defined
          if (!station) {
            console.error(
              "Station is undefined at index",
              idx,
              "for lineData:",
              lineData
            );
            continue; // Skip this index if station is not defined
          }

          // SQL query with parameter placeholders
          const query = `
            INSERT INTO stationdata (
              line, station, ridership, date
            ) VALUES (
              $1, $2, $3, $4
            )
            ON CONFLICT (date, station, line) 
            DO UPDATE SET 
              ridership = EXCLUDED.ridership
          `;

          // Insert data into the database
          await client.query(query, [line, station, value, yesterdayDateIST]);
        }
      }
    }

    console.log(
      "Data from allstations API inserted successfully to database table allstation"
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Axios error:", error.toJSON());
    } else {
      console.error("Unexpected error:", error);
    }
  }
};

// Schedule the task to run every day at 1:00 AM IST
cron.schedule('30 19 * * *', () => {
  console.log("Running fetchDataAndStore at 1:00 AM IST");
  fetchDataAndStore();
  fetchDataAndStore2();
});

// Schedule the task to run every day at 6:00 PM IST
cron.schedule('30 12 * * *', () => {
  console.log("Running fetchDataAndStore at 6:00 PM IST");
  fetchDataAndStore();
  fetchDataAndStore2();
});

// Basic express server setup
router.get("/", (req, res) => {
  res.send("Server is running");
});

app.use(`/.netlify/functions/api`, router);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
module.exports.handler = serverless(app);
