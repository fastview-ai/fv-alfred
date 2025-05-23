const { execSync } = require("child_process");
const { filterCacheAsync } = require("./filter-cache-async");
const utils = require("./create-linear-issue-logic");

const linearToken = process.env.LINEAR_API_KEY;
if (!linearToken) {
  throw new Error("LINEAR_API_KEY is not set");
}

const dryRun = (() => {
  try {
    if (process.env.DRY_RUN === "1") return true;
    const gitStatus = execSync("git status --porcelain").toString();
    return gitStatus
      .split("\n")
      .some((line) => line.trim().endsWith("create-linear-issue-mutation.js"));
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") {
      return true;
    }
    return false;
  }
})();

async function createIssueMutation(
  teamId,
  projectId,
  assigneeId,
  priority,
  title
) {
  if (dryRun) {
    console.log(
      teamId?.slice(0, 4) || null,
      projectId?.slice(0, 4) || null,
      assigneeId?.slice(0, 4) || null,
      priority || 0,
      title
    );
  }

  const doFetch = dryRun ? console.log : fetch;
  const response = await doFetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: linearToken,
    },
    body: JSON.stringify({
      query: `
          mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                identifier
                url
                assignee {
                  displayName
                }
              }
            }
          }
        `,
      variables: {
        input: {
          teamId,
          projectId,
          assigneeId,
          priority,
          title,
        },
      },
    }),
  });

  filterCacheAsync("linear-filter", "linear-cache.json");

  if (!response?.ok) {
    console.error(response);
    try {
      const errorBody = await response.json();
      console.error("Response body:", JSON.stringify(errorBody, null, 2));
    } catch (e) {
      // Response doesn't contain valid JSON
    }
    throw new Error("Fetch Error: " + (response.statusText ?? "unknown"));
  }

  const { data, errors } = await response.json();
  if (errors) {
    console.log(`GraphQL Error: ${errors[0].message}`);
    throw new Error(errors[0].message);
  }

  return data.issueCreate.issue;
}

async function main() {
  try {
    const input = process.argv[2];

    if (!input) {
      console.error("Missing required input");
      console.log("Please provide an issue title");
      return;
    }

    // Use the unified workflow processing
    const workflow = await utils.processWorkflow(input, linearToken);
    if (workflow.error) {
      console.error(workflow.error);
      return;
    }

    const {
      metadata,
      params: finalParams,
      explicitChoices,
      title,
      titleValidation,
    } = workflow;

    // Validate the title
    if (!titleValidation.valid) {
      console.log(titleValidation.message);
      return;
    }

    // Write updated preferences using shared function - only save explicit choices
    utils.writePrefs(
      {
        ...metadata,
        teamsChoice: explicitChoices.teamId,
        projectsChoice: explicitChoices.projectId,
        usersChoice: explicitChoices.assigneeId,
        prioritiesChoice: explicitChoices.priorityId,
      },
      dryRun
    );

    try {
      const issue = await createIssueMutation(
        finalParams.teamId || null,
        finalParams.projectId || null,
        finalParams.assigneeId || null,
        finalParams.priorityId || 0,
        title
      );
      console.log(issue.identifier);
    } catch (error) {
      console.error(error);
      console.log("Failed to create the issue.");
      return;
    }
  } catch (error) {
    console.error(error);
    console.log("An unexpected error occurred.");
    return;
  }
}

if (require.main === module) {
  main();
}
