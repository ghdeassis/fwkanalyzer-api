import express from "express";
import AnalyzerController from "../controllers/analyzer.controller.js";

const router = express.Router();
router.post("/user", AnalyzerController.analyzerUser);

export default router;
