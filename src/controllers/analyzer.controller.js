import AnalyzerService from "../services/analyzer.service.js";

async function analyzerUser(req, res) {
  const { framework, email } = req.body;
  if (!framework || !email) {
    throw new Error("Framework and Email are required.");
  }
  res.send(await AnalyzerService.analyzeUser(framework, email));
  logger.info(`POST /analyzer/user - ${framework - email}`);
}

export default { analyzerUser };
