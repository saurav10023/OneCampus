import "dotenv/config";

import { app } from "./app.js";
import connectDB from "./db/index.js";

console.log("🚀 index.js started");
console.log("ENV CHECK:");

connectDB()
  .then(() => {
    app.listen(process.env.PORT || 8000, () => {
      console.log(`server is running at PORT ${process.env.PORT}`);
    });
  })
  .catch((error) => {
    console.log("MongoDB connection failed", error);
  });