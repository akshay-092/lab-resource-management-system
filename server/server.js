const express = require('express');
const cors = require('cors');
const app = express();
const dotenv = require('dotenv');
const databseConnection = require("./utils/databseConnect");
const apiRoutes = require("./routes");

dotenv.config();
app.use(cors());
app.use(express.json());
const PORT = process.env.SERVER_PORT || 5000;

databseConnection();

app.use("/api", apiRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
