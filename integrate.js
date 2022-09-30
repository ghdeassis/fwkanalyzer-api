import AnalyzerService from "./src/services/analyzer.service.js";
import { setupLogger } from "./src/utils/logger-util.js";

setupLogger();

const framework = "react";
const language = "JavaScript";
const commands = [
  "render",
  "setState",
  "Component",
  "Fragment",
  "componentDidMount",
  "componentDidUpdate",
  "componentWillUnmount",
  "useEffect",
  "useState",
  "useRef",
  "useContext",
];
const extensions = ["js", "jsx", "ts", "tsx"];
const frameworkFile = "package.json";

AnalyzerService.integrate(
  framework,
  language,
  commands,
  extensions,
  frameworkFile
);
