import nodegit from "nodegit";
import simpleGit from "simple-git";
import fs from "fs";
import OctokitService from "../services/octokit.service.js";
import { gitlogPromise } from "gitlog";

async function analyzeUser(framework, email) {
  logger.info(`start time ${email}: ${new Date()}`);

  const repositories = await getUserRepositories(email);
  const frameworkInfo = JSON.parse(
    await fs.promises.readFile(`./data/${framework}/result.json`)
  );
  const { commands, extensions, frameworkFile } = frameworkInfo;

  let result = await doAnalysis(
    framework,
    repositories,
    commands.map((cmd) => cmd.command),
    extensions,
    frameworkFile,
    email,
    null
  );
  result = generateMetrics(result, commands);

  logger.info(`end time ${email}: ${new Date()}`);

  return {
    user: result.users[0],
    framework: {
      commands: frameworkInfo.commands,
      averageCoverage: frameworkInfo.averageCoverage,
      averageFrequency: frameworkInfo.averageFrequency,
      averageLoc: frameworkInfo.averageLoc,
      years: frameworkInfo.years,
    },
  };
}

async function integrate(
  framework,
  language,
  commands,
  extensions,
  frameworkFile
) {
  logger.info(`start time: ${new Date()}`);

  const repositories = await getRepositories(framework, language);
  let result = await doAnalysis(
    framework,
    repositories,
    commands,
    extensions,
    frameworkFile,
    null,
    null
  );
  result.repositories = repositories;

  await fs.promises.writeFile(
    `./data/${framework}/result.json`,
    JSON.stringify(result)
  );

  logger.info(`end time first analysis: ${new Date()}`);

  logger.info(`start time second analysis: ${new Date()}`);

  for (const u of result.users) {
    const userRepoList = await getUserRepositories(u.email);
    if (userRepoList) {
      const repoListToBeAnalyzed = [];
      for (const repo of userRepoList) {
        if (!repositories.find((r) => r.url === repo.url)) {
          repoListToBeAnalyzed.push(repo);
        }
      }
      result = await doAnalysis(
        framework,
        repoListToBeAnalyzed,
        commands,
        extensions,
        frameworkFile,
        u.email,
        result
      );

      await fs.promises.writeFile(
        `./data/${framework}/result.json`,
        JSON.stringify(result)
      );
    }
  }

  logger.info(`end time second analysis: ${new Date()}`);

  /*let result = JSON.parse(
    await fs.promises.readFile(`./data/${framework}/result.json`)
  );*/

  result = generateMetrics(result, commands);
  result.language = language;
  result.extensions = extensions;
  result.frameworkFile = frameworkFile;
  await fs.promises.writeFile(
    `./data/${framework}/result.json`,
    JSON.stringify(result)
  );

  logger.info(`end time: ${new Date()}`);
}

async function doAnalysis(
  framework,
  repositories,
  commands,
  extensions,
  frameworkFile,
  email,
  result
) {
  if (!result) {
    result = { framework, users: [], repoCount: 0, usersRepoCount: 0 };
  }
  for (const repo of repositories) {
    const path = `./data/${framework}/repos/${repo.owner}/${repo.name}`;
    if (!fs.existsSync(path)) {
      await clone(repo.url, path);
    }
    if (await checkFwk(path, frameworkFile, framework)) {
      if (email) {
        result.usersRepoCount++;
      } else {
        result.repoCount++;
      }
      const newResult = await analyzeRepo(
        result,
        path,
        commands,
        extensions,
        email
      );
      if (newResult) {
        result = newResult;
      }
    }
    await deleteFolder(path);
  }
  return result;
}

async function deleteFolder(path) {
  //getBranchCommit doest not release the folder on windows, on mac it works (https://github.com/nodegit/nodegit/issues/1412)
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        await fs.promises.rm(path, { recursive: true, force: true });
      } catch (err) {
        logger.error(err);
      } finally {
        resolve();
      }
    }, 1);
  });
}

async function getRepositories(framework, language) {
  try {
    const list = [];
    const q = `stars:50..1000 ${framework} language:${language}`;
    const octokit = OctokitService.getOctokit();
    const resp = await octokit.rest.search.repos({ q, per_page: 50 });
    for (const repo of resp.data.items) {
      if (!list.find((r) => r.fullName === repo.full_name)) {
        list.push({
          fullName: repo.full_name,
          name: repo.name,
          url: repo.html_url,
          owner: repo.owner.login,
        });
      }
    }
    logger.info(list.length + " repositories found");
    return list;
  } catch (err) {
    logger.info("erro getRepositories", err);
  }
}

async function getUserRepositories(email) {
  logger.info(`getting user repositories: ${email} - ${new Date()}`);
  let list = [];
  try {
    const octokit = OctokitService.getOctokit();
    const q = `author-email:${email}`;
    const items = [];
    let firstTime = true;
    let totalCount = 0;
    let page = 1;
    while ((firstTime || items.length !== totalCount) && page <= 10) {
      const resp = await octokit.rest.search.commits({
        q,
        per_page: 100,
        page,
      });
      totalCount = resp.data.total_count;
      items.push(...resp.data.items);
      page++;
      firstTime = false;
    }

    //keep track of analyzed commits, discarding the same commits in a different fork
    const commitsAlreadyAnalyzedList = [];

    for (const event of items) {
      if (
        !list.find((r) => r.fullName === event.repository.full_name) &&
        !commitsAlreadyAnalyzedList.find((c) => c === event.sha)
      ) {
        commitsAlreadyAnalyzedList.push(event.sha);
        list.push({
          fullName: event.repository.full_name,
          name: event.repository.name,
          url: event.repository.html_url,
          owner: event.repository.owner.login,
        });
      }
    }
  } catch (err) {
    logger.error(
      `error getUserRepositories email: ${email} - ${new Date()}`,
      err
    );
  }
  return list;
}

async function clone(url, path) {
  while (true) {
    try {
      await simpleGit().clone(url, path, { "--no-checkout": null });
      break;
    } catch (err) {
      logger.error(err);
      await sleep(2000);
    }
  }
}

async function sleep(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

//check whether if the framework file is in the root folder, avoiding repositories with multiple projects in the same repo
async function checkFwk(path, file, framework) {
  try {
    const list = await gitlogPromise({ repo: path, file });
    if (list && list.length > 0) {
      const repo = await nodegit.Repository.open(path);
      for (const item of list) {
        const commit = await repo.getCommit(item.hash);
        const diffList = await commit.getDiff();
        for (const diff of diffList) {
          const patches = await diff.patches();
          for (const patch of patches) {
            const path = patch.newFile().path();
            if (path.includes(file)) {
              const hunks = await patch.hunks();
              for (const hunk of hunks) {
                const lines = await hunk.lines();
                for (const line of lines) {
                  const codeLine = line.content().trim();
                  if (
                    codeLine.includes(`"${framework}"`) ||
                    codeLine.includes(`'${framework}'`)
                  ) {
                    await repo.cleanup();
                    return true;
                  }
                }
              }
            }
          }
        }
      }
      await repo.cleanup();
    }
    return false;
  } catch (err) {
    logger.error(err);
  }
}

/*async function checkFramework(path, file, framework) {
  try {
    logger.info(`checking project: ${path}`);
    const repo = await nodegit.Repository.open(path);
    const branch = await repo.getCurrentBranch();
    const commit = await repo.getBranchCommit(branch.shorthand());
    const tree = await commit.getTree();
    const walker = tree.walk();
    const p = new Promise((resolve, reject) => {
      const fileEntries = [];
      walker.on("end", async () => {
        for (const entry of fileEntries) {
          const blob = await entry.getBlob();
          const content = blob.content().toString();
          if (
            content.includes(`"${framework}"`) ||
            content.includes(`'${framework}'`)
          ) {
            await repo.cleanup();
            resolve(true);
            return;
          }
        }
        await repo.cleanup();
        resolve(false);
      });
      walker.on("error", reject);
      walker.on("entry", async (entry) => {
        const fileName = entry.path().replace(/^.*[\\\/]/, "");
        if (fileName === file) {
          fileEntries.push(entry);
        }
      });
    });
    walker.start();
    return p;
  } catch (err) {
    logger.error(err);
  }
}*/

async function analyzeRepo(result, path, commands, extensions, email) {
  let repo;
  try {
    logger.info(`analyzing repo: ${path} - ${new Date()}`);

    const getYearsInfo = (user, year, month) => {
      if (!user.years) {
        user.years = {
          total: 0,
        };
      }
      if (user.years[year]) {
        if (user.years[year][month]) {
          user.years[year][month] = user.years[year][month] + 1;
        } else {
          user.years[year][month] = 1;
        }
        user.years[year].total++;
      } else {
        user.years[year] = { [month]: 1 };
        user.years[year].total = 1;
      }
      user.years.total++;
      return user.years;
    };

    const commandFound = async (command, email, year, month) => {
      const user = result.users.find((u) => u.email === email);
      //check if user is already in the list
      if (user) {
        const obj = user.commands.find((c) => c.command === command);
        //check if command is already in the list
        if (obj) {
          obj.count++;
        } else {
          user.commands.push({ command, count: 1 });
        }
        user.years = getYearsInfo(user, year, month);
      } else {
        const user = {
          email,
          loc: 0,
          commands: [{ command, count: 1 }],
        };
        user.years = getYearsInfo(user, year, month);
        result.users.push(user);
      }
    };

    const sumLoc = (loc, email, year) => {
      let user = result.users.find((u) => u.email === email);
      let newUser = false;
      if (user) {
        user.loc += loc;
      } else {
        user = { email, loc, commands: [] };
        newUser = true;
      }
      if (!user.years) {
        user.years = { total: 0 };
        user.years[year] = { loc, total: 0 };
      } else if (!user.years[year]) {
        user.years[year] = { loc, total: 0 };
      } else if (!user.years[year].loc) {
        user.years[year].loc = loc;
      } else {
        user.years[year].loc += loc;
      }
      if (newUser) {
        result.users.push(user);
      }
    };

    repo = await nodegit.Repository.open(path);
    const commits = email
      ? await getUserCommits(repo, path, email)
      : await getCommits(repo);
    for (const commit of commits) {
      //check if the searched user is the commit author. if user is not passed, analyze all users
      if (!email || email === commit.author().email()) {
        const diffList = await commit.getDiff();
        for (const diff of diffList) {
          const patches = await diff.patches();
          for (const patch of patches) {
            const path = patch.newFile().path();
            const fileExtension = path.split(".").pop();
            // verify if the file has one of the searched extensions
            if (extensions.includes(fileExtension)) {
              const hunks = await patch.hunks();
              for (const hunk of hunks) {
                const lines = await hunk.lines();
                for (const line of lines) {
                  // verify if line starts with '+', indicating the inclusion.
                  // we don't care about deletions '-' and untouched lines
                  if (String.fromCharCode(line.origin()) === "+") {
                    const codeLine = line.content().trim();
                    for (const command of commands) {
                      if (codeLine.includes(command)) {
                        await commandFound(
                          command,
                          commit.author().email(),
                          commit.date().getFullYear(),
                          commit.date().getMonth() + 1
                        );
                      }
                    }
                  }
                }
                sumLoc(
                  lines.length,
                  commit.author().email(),
                  commit.date().getFullYear()
                );
              }
            }
          }
        }
      }
    }
    await repo.cleanup();
    let user = result.users.find((u) => u.email === email);
    if (user) {
      if (user.repoCount) {
        user.repoCount++;
      } else {
        user.repoCount = 1;
      }
    }
    return result;
  } catch (err) {
    logger.error(err);
    if (repo) {
      repo.cleanup();
    }
  }
}

async function getCommits(repo) {
  try {
    const branch = await repo.getCurrentBranch();
    const commit = await repo.getBranchCommit(branch.shorthand());
    const history = commit.history(),
      p = new Promise((resolve, reject) => {
        history.on("end", resolve);
        history.on("error", reject);
      });
    history.start();
    return p;
  } catch (err) {
    logger.error(err);
  }
}

async function getUserCommits(repo, path, email) {
  try {
    const commits = [];
    const list = await gitlogPromise({ repo: path, author: email });
    for (const item of list) {
      const commit = await repo.getCommit(item.hash);
      commits.push(commit);
    }
    return commits;
  } catch (err) {
    logger.error(err);
  }
}

function generateMetrics(result, commands) {
  logger.info(`start time metrics generation: ${new Date()}`);

  result.users = result.users.filter((user) => user.commands.length > 0);
  result.usersCount = result.users.length;
  result.users.forEach((user) => {
    user.averageCoverage = user.commands.length / commands.length;
    user.commands.forEach((cmd) => {
      cmd.averageFrequency = (cmd.count / user.loc) * 1000;
    });
    user.averageFrequency =
      (user.commands.reduce((prev, curr) => prev + curr.count, 0) / user.loc) *
      1000;
  });
  result.commands = commands.map((cmd) => {
    return {
      command: cmd,
      count: result.users.reduce(
        (prev, curr) =>
          prev +
          (curr.commands.find((c) => c.command === cmd)
            ? curr.commands.find((c) => c.command === cmd).count
            : 0),
        0
      ),
    };
  });
  result.commands.forEach((cmd) => {
    cmd.averageUsage = cmd.count / result.users.length;
    let sumAverageFrequency = 0;
    result.users.forEach((user) => {
      const command = user.commands.find((c) => c.command === cmd.command);
      if (command) {
        sumAverageFrequency += command.averageFrequency;
      }
    });
    cmd.averageFrequency = sumAverageFrequency / result.users.length;
  });
  result.averageCoverage =
    result.users.reduce((prev, curr) => prev + curr.averageCoverage, 0) /
    result.users.length;
  result.averageFrequency =
    result.users.reduce((prev, curr) => prev + curr.averageFrequency, 0) /
    result.users.length;
  result.averageLoc =
    result.users.reduce((prev, curr) => prev + curr.loc, 0) /
    result.users.length;

  let yearsList = [];
  result.years = {};
  result.users.forEach((user) => {
    yearsList.push(...Object.keys(user.years));
  });
  const yearsSet = new Set(yearsList);
  yearsSet.delete("total");
  yearsList = [...yearsSet];
  yearsList.forEach((year) => {
    result.years[year] = { total: 0, countUsers: 0 };
  });
  result.users.forEach((user) => {
    Object.keys(user.years).forEach((year) => {
      if (year !== "total") {
        result.years[year].total += user.years[year].total;
        result.years[year].countUsers++;
      }
    });
  });
  Object.keys(result.years).forEach((year) => {
    result.years[year].averageUsage =
      result.years[year].total / result.years[year].countUsers;
  });

  logger.info(`end time metrics generation: ${new Date()}`);

  return result;
}

export default {
  analyzeUser,
  integrate,
};
