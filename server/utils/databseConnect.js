const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

/**
 * Connects to MongoDB using Mongoose.
 * Uses `MONGODB_URI` from environment variables, with a local fallback.
 */
const databseConnection = async () => {
  if (!process.env.MONGODB_URI) {
    console.log("Warning: MONGODB_URI not set in environment variables. Falling back to local MongoDB.");
  }
  const mongoUri =
    process.env.MONGODB_URI;

  await mongoose
    .connect(mongoUri)
    .then(() => {
      console.log("Database connected successfully");
    })
    .catch((err) => {
      console.log("Database connection failed", err);
    });
};

module.exports = databseConnection;

