import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";
import "dotenv/config";

function getOctokit() {
  if (global.octokit) {
    return octokit;
  }
  const MyOctokit = Octokit.plugin(throttling).plugin(retry);
  global.octokit = new MyOctokit({
    auth: process.env.GITHUB_KEY,
    throttle: {
      onRateLimit: (retryAfter, options, octokit) => {
        console.log(
          `Request quota exhausted for request ${options.method} ${options.url}`
        );
        if (options.request.retryCount === 0) {
          octokit.log.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onAbuseLimit: (retryAfter, options, octokit) => {
        console.log(
          `Abuse detected for request ${options.method} ${options.url}`
        );
      },
    },
  });
  return global.octokit;
}

export default {
  getOctokit,
};
