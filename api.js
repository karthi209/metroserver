require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const cron = require("node-cron");  // Scheduling library

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL Database Connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Function to get yesterday's date in YYYY-MM-DD format in IST
const getYesterdayDateIST = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  // Convert to IST (UTC +5:30)
  const ISTOffset = 5 * 60 * 60 * 1000 + 30 * 60 * 1000;
  const ISTDate = new Date(date.getTime() + ISTOffset);
  return ISTDate.toISOString().split("T")[0];
};

// Function to fetch total ticket data
const fetchDataAllTickets = async () => {
  try {
    console.log("Fetching data from allTicketCount API");
    const response = await axios.get(process.env.API_ALLTICKETCOUNT);
    const totalTickets = response.data.totalTickets;
    const date = getYesterdayDateIST();
    return { totalTickets, date };
  } catch (error) {
    console.error("Error fetching total ticket data:", error.message);
    throw error;
  }
};

// Function to fetch station-specific ridership data
const fetchDataStations = async () => {
  try {
    console.log("Fetching data from allstations API");
    const response = await axios.get(process.env.API_STATIONDATA);
    const data = response.data;

    const stations = data.map((lineData) => {
      const { line, categories, series } = lineData;
      const seriesTotal = series.find(serie => serie.name === "Total");

      return seriesTotal.data.map((value, idx) => ({
        line,
        station: categories[idx],
        ridership: value,
      }));
    }).flat();

    const date = getYesterdayDateIST();

    return { stations, date };
  } catch (error) {
    console.error("Error fetching station data:", error.message);
    throw error;
  }
};

// Function to fetch station-specific hourly ridership data
const fetchDataHourly = async () => {
  try {
    console.log("Fetching data from hourly API");
    const response = await axios.get(process.env.API_HOURLYDATA);
    
    // Log the response data to inspect the structure
    console.log("Response from hourly API:", response.data);

    const { line, categories, series } = response.data;

    // Check if 'series' is an array before trying to process it
    if (!Array.isArray(series)) {
      throw new Error("Series is not an array. Received: " + JSON.stringify(series));
    }

    // Find the "Total" series in the data
    const seriesTotal = series.find(serie => serie.name === "Total");

    // If seriesTotal is not found, handle the error
    if (!seriesTotal) {
      throw new Error('"Total" series not found in the data');
    }

    // Map through the 'data' array of the "Total" series
    const hours = seriesTotal.data.map((value, idx) => ({
      hour: categories[idx], // Corresponding hour
      ridership: value,       // Value for the "Total" series at this hour
    }));

    const date = getYesterdayDateIST();

    return { hours, date };
  } catch (error) {
    console.error("Error fetching hourly data:", error.message);
    throw error;
  }
};



// Function to save data to the database
const saveToDatabase = async (totalTickets, stationsData, date, hourlyData) => {
  try {
    const query = `
      INSERT INTO tickets_data (date, total_tickets, stations_data, hourly_data)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (date) 
      DO UPDATE SET 
        total_tickets = EXCLUDED.total_tickets,
        stations_data = EXCLUDED.stations_data,
        hourly_data = EXCLUDED.hourly_data;
    `;
    
    const stationsDataJSON = {
      totalTickets,
      stations: stationsData,
    };

    const hourlyDataJSON = {
      hours: hourlyData,
    };

    await pool.query(query, [date, totalTickets, JSON.stringify(stationsDataJSON), JSON.stringify(hourlyDataJSON)]);
    console.log("Data inserted/updated successfully in tickets_data");
  } catch (error) {
    console.error("Error saving data to the database:", error.message);
    throw error;
  }
};

// API Route to fetch and save data (For manual trigger)
app.get("/tickets/save", async (req, res) => {
  try {
    const totalTicketsData = await fetchDataAllTickets();
    const stationsData = await fetchDataStations();
    const hourlyData = await fetchDataHourly();
    
    await saveToDatabase(
      totalTicketsData.totalTickets,
      stationsData.stations,
      totalTicketsData.date,
      hourlyData.hours
    );

    res.json({ success: true, message: "Data saved successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch and save data" });
  }
});

// API Route to retrieve all ticket data
app.get("/tickets", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tickets_data ORDER BY date DESC");
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve ticket data" });
  }
});

// Schedule the data fetching and saving to run once every day at midnight (3AM IST)
cron.schedule('30 15 * * *', async () => {  // Adjusted to 3:30 PM UTC (midnight IST)
  console.log('Running scheduled job to fetch and save data');
  try {
    const totalTicketsData = await fetchDataAllTickets();
    const stationsData = await fetchDataStations();
    const hourlyData = await fetchDataHourly();
    
    await saveToDatabase(
      totalTicketsData.totalTickets,
      stationsData.stations,
      totalTicketsData.date,
      hourlyData.hours
    );
  } catch (error) {
    console.error('Scheduled job failed:', error.message);
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
