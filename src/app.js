import express from "express";
import AnalyzerRoutes from "./routes/analyzer.routes.js";
import cors from "cors";
import { setupLogger } from "./utils/logger-util.js";

setupLogger();

const app = express();
app.use(express.json());
app.use(cors());
app.use("/analyzer", AnalyzerRoutes);
app.use((err, req, res, next) => {
  logger.error(`${req.method} ${req.baseUrl} - ${err.message}`);
  res.status(400).send({ error: err.message });
});

export default app;
