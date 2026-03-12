/**
 * Fetch tasks from GitHub Projects (ProjectV2) using GraphQL API
 * Filters tasks assigned to team members from developers aim.csv
 */

const { graphql } = require('@octokit/graphql');
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${process.env.GITHUB_TOKEN}`,
  },
});

/**
 * Load team members from CSV
 */
async function loadTeamMembers() {
  const csvPath = path.join(__dirname, '..', process.env.DEVELOPERS_FILE || 'developers aim.csv');
  const csvContent = await fs.readFile(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  return records.map(record => ({
    name: record.name,
    gid: record.gid,
    email: record.email,
    githubUser: record.github_user?.trim(),
    team: record.team?.trim(),
  })).filter(member => member.githubUser);
}

/**
 * Get project node ID from organization and project number
 */
async function getProjectNodeId(org, projectNumber) {
  const query = `
    query($org: String!, $number: Int!) {
      organization(login: $org) {
        projectV2(number: $number) {
          id
          title
        }
      }
    }
  `;

  const result = await graphqlWithAuth(query, { org, number: projectNumber });
  return result.organization.projectV2;
}

/**
 * Fetch items from a GitHub Project
 */
async function fetchProjectItems(projectNodeId) {
  const query = `
    query($projectId: ID!, $cursor: String) {
      node(id: $projectId) {
        ... on ProjectV2 {
          title
          items(first: 100, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              type
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldNumberValue {
                    number
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                }
              }
              content {
                ... on Issue {
                  id
                  title
                  url
                  number
                  state
                  createdAt
                  updatedAt
                  closedAt
                  repository {
                    name
                    owner {
                      login
                    }
                  }
                  assignees(first: 10) {
                    nodes {
                      login
                      name
                      email
                    }
                  }
                  labels(first: 10) {
                    nodes {
                      name
                    }
                  }
                }
                ... on PullRequest {
                  id
                  title
                  url
                  number
                  state
                  createdAt
                  updatedAt
                  closedAt
                  mergedAt
                  repository {
                    name
                    owner {
                      login
                    }
                  }
                  assignees(first: 10) {
                    nodes {
                      login
                      name
                      email
                    }
                  }
                  labels(first: 10) {
                    nodes {
                      name
                    }
                  }
                }
                ... on DraftIssue {
                  id
                  title
                  createdAt
                  updatedAt
                  assignees(first: 10) {
                    nodes {
                      login
                      name
                      email
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  let allItems = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const result = await graphqlWithAuth(query, { projectId: projectNodeId, cursor });
    const items = result.node.items.nodes;
    allItems = allItems.concat(items);

    hasNextPage = result.node.items.pageInfo.hasNextPage;
    cursor = result.node.items.pageInfo.endCursor;
  }

  return { title: result.node.title, items: allItems };
}

/**
 * Filter tasks to only those assigned to team members
 */
function filterTeamTasks(items, teamMembers) {
  const teamGithubUsers = new Set(teamMembers.map(m => m.githubUser.toLowerCase()));

  return items.filter(item => {
    if (!item.content) return false;

    const assignees = item.content.assignees?.nodes || [];
    if (assignees.length === 0) return false;

    // Check if any assignee is in our team
    return assignees.some(assignee =>
      teamGithubUsers.has(assignee.login.toLowerCase())
    );
  });
}

/**
 * Transform GitHub items to standardized format
 */
function transformGitHubItems(items, projectName, projectId) {
  return items.map(item => {
    const content = item.content;
    if (!content) return null;

    // Extract status from field values
    const statusField = item.fieldValues.nodes.find(
      field => field.field?.name === 'Status'
    );
    const status = statusField?.name || 'Unknown';

    // Get assignees (sorted chronologically - first assigned is primary)
    const assignees = content.assignees?.nodes || [];
    const primaryAssignee = assignees[0];

    return {
      id: content.id,
      projectItemId: item.id,
      title: content.title,
      url: content.url,
      type: item.type,
      status: status,
      assignees: assignees.map(a => ({
        login: a.login,
        name: a.name,
        email: a.email,
      })),
      primaryAssignee: primaryAssignee ? primaryAssignee.login : null,
      repository: content.repository ? `${content.repository.owner.login}/${content.repository.name}` : null,
      number: content.number,
      state: content.state,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      closedAt: content.closedAt,
      mergedAt: content.mergedAt,
      labels: content.labels?.nodes.map(l => l.name) || [],
      source: {
        platform: 'github',
        projectName: projectName,
        projectId: projectId,
      },
    };
  }).filter(item => item !== null);
}

/**
 * Main function to fetch all GitHub tasks
 */
async function fetchAllGitHubTasks() {
  console.log('Loading team members...');
  const teamMembers = await loadTeamMembers();
  console.log(`Found ${teamMembers.length} team members with GitHub accounts`);

  const projectConfig = JSON.parse(
    await fs.readFile(path.join(__dirname, '../config/project-config.json'), 'utf-8')
  );

  const allTasks = [];

  for (const project of projectConfig.projects.github) {
    console.log(`\nFetching project: ${project.name}`);

    try {
      const projectInfo = await getProjectNodeId(projectConfig.masterBoard.org, project.projectNumber);
      console.log(`  Project ID: ${projectInfo.id}`);

      const { title, items } = await fetchProjectItems(projectInfo.id);
      console.log(`  Total items: ${items.length}`);

      const teamItems = filterTeamTasks(items, teamMembers);
      console.log(`  Team member items: ${teamItems.length}`);

      const transformedItems = transformGitHubItems(teamItems, project.name, project.id);
      allTasks.push(...transformedItems);

    } catch (error) {
      console.error(`  Error fetching ${project.name}:`, error.message);
    }
  }

  // Save to file
  const outputPath = path.join(__dirname, '../reports/github-tasks.json');
  await fs.writeFile(outputPath, JSON.stringify(allTasks, null, 2));
  console.log(`\n✓ Saved ${allTasks.length} GitHub tasks to ${outputPath}`);

  return allTasks;
}

// Run if called directly
if (require.main === module) {
  fetchAllGitHubTasks()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { fetchAllGitHubTasks, loadTeamMembers };
