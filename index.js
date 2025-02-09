const core = require('@actions/core');
const github = require('@actions/github');

async function setOutputs(files) {
  const pathsChanged = []
  const filesChanged = []
  files.forEach(file => {
    pathsChanged.push(file.filename.split("/").slice(0, -1).join("/"))
    filesChanged.push(file.filename)
  })
  core.setOutput("paths_list", JSON.stringify([...new Set(pathsChanged)]))
  core.setOutput("file_list", JSON.stringify([...new Set(filesChanged)]))
  core.setOutput("paths_str", [...new Set(pathsChanged)].join())
  core.setOutput("file_str", [...new Set(filesChanged)].join())
}

const main = async () => {
  try {
    const path = core.getInput('path', {required: false}) || "./"
    const token = core.getInput('token', {required: true})
    let changedFiles = [];
    const context = github.context;

    const { eventName, payload, repo } = context;

    let base, head;

    switch (eventName) {
    case 'pull_request':
      base = payload.pull_request?.base?.sha;
      head = payload.pull_request?.head?.sha;
      break;
    case 'push':
      base = payload.before;
      head = payload.after;
      break;
    default:
      core.setFailed('This action only supports pull requests and pushes.')
    }

    core.info(`Base commit: ${base}`);
    core.info(`Head commit: ${head}`);
    
    const regExp = RegExp(path)
    const octokit = new github.getOctokit(token);

    if (!base || !head) {
      core.setFailed(
        `Missing base and head commits in ${context.eventName} event.`
      );
    }
    const response = await octokit.rest.repos.compareCommitsWithBasehead({
      basehead: `${base}...${head}`,
      owner: repo.owner,
      repo: repo.repo,
    });

    if (response.status !== 200) {
      core.setFailed(
        `Github API failed trying to compare ${base} and ${head}; returned ${response.status}, expected 200.`
      );
    }

    core.info(`Head is ${response.data.status} of base`);
    if (response.data.status !== 'ahead') {
      core.setFailed(
        `Commit ${head} is not ahead of ${base}`
      );
    }
    changedFiles = response.data.files;
    
    const filteredFiles = changedFiles.filter(file => {
      let isMatch = regExp.test(file.filename)
      console.log(`- ${isMatch} [** match **] ${file.filename}`)
      return isMatch
    })

    if (filteredFiles.length === 0) {
      console.log("No matches found.")
      console.log(`Raw input: ${path}`)
      console.log(`Regex: ${regExp.toString()}`)
    }
    await setOutputs(filteredFiles);

  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
