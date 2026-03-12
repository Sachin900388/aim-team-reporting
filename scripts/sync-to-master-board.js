/**
 * Sync tasks from GitHub and Asana to the Master Board
 * Maps statuses and creates/updates items in AIM_Team_Master_Board
 */

const { graphql } = require('@octokit/graphql');
const fs = require('fs').promises;
const path = require('path');
const { fetchAllGitHubTasks } = require('./fetch-github-tasks');
const { fetchAllAsanaTasks } = require('./fetch-asana-tasks');
require('dotenv').config();

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${process.env.GITHUB_TOKEN}`,
  },
});

/**
 * Load status mapping configuration
 */
async function loadStatusMapping() {
  const mappingPath = path.join(__dirname, '../config/status-mapping.json');
  return JSON.parse(await fs.readFile(mappingPath, 'utf-8'));
}

/**
 * Map source status to master board status
 */
function mapStatus(sourceStatus, platform, projectGid = null) {
  const mapping = require('../config/status-mapping.json');

  if (platform === 'github') {
    return mapping.mappings.github[sourceStatus] || mapping.defaultMapping;
  }

  if (platform === 'asana') {
    // Check project-specific mapping first
    if (projectGid && mapping.mappings.asana.project_specific[projectGid]) {
      const projectMapping = mapping.mappings.asana.project_specific[projectGid];
      if (projectMapping[sourceStatus]) {
        return projectMapping[sourceStatus];
      }
    }
    // Fall back to default Asana mapping
    return mapping.mappings.asana.default[sourceStatus] || mapping.defaultMapping;
  }

  return mapping.defaultMapping;
}

/**
 * Get master project node ID
 */
async function getMasterProjectId() {
  const projectConfig = JSON.parse(
    await fs.readFile(path.join(__dirname, '../config/project-config.json'), 'utf-8')
  );

  const owner = projectConfig.masterBoard.org;
  const projectNumber = parseInt(process.env.MASTER_PROJECT_NUMBER);

  // Try user query first (for personal accounts)
  const userQuery = `
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          id
          title
          fields(first: 20) {
            nodes {
              ... on ProjectV2Field {
                id
                name
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const result = await graphqlWithAuth(userQuery, {
      login: owner,
      number: projectNumber,
    });

    if (result.user && result.user.projectV2) {
      return result.user.projectV2;
    }
  } catch (error) {
    // Fall through to organization query
  }

  // Try organization query
  const orgQuery = `
    query($org: String!, $number: Int!) {
      organization(login: $org) {
        projectV2(number: $number) {
          id
          title
          fields(first: 20) {
            nodes {
              ... on ProjectV2Field {
                id
                name
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const result = await graphqlWithAuth(orgQuery, {
    org: owner,
    number: projectNumber,
  });

  return result.organization?.projectV2;
}

/**
 * Create a draft issue in the master project
 */
async function createDraftIssue(projectId, title, body, assignees) {
  const mutation = `
    mutation($projectId: ID!, $title: String!, $body: String) {
      addProjectV2DraftIssue(input: {
        projectId: $projectId
        title: $title
        body: $body
      }) {
        projectItem {
          id
        }
      }
    }
  `;

  const result = await graphqlWithAuth(mutation, {
    projectId,
    title,
    body,
  });

  return result.addProjectV2DraftIssue.projectItem.id;
}

/**
 * Update status field for a project item
 */
async function updateItemStatus(projectId, itemId, statusFieldId, statusOptionId) {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: $value
      }) {
        projectV2Item {
          id
        }
      }
    }
  `;

  await graphqlWithAuth(mutation, {
    projectId,
    itemId,
    fieldId: statusFieldId,
    value: {
      singleSelectOptionId: statusOptionId,
    },
  });
}

/**
 * Get existing items in master board to avoid duplicates
 */
async function getExistingItems(projectId) {
  const query = `
    query($projectId: ID!, $cursor: String) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              content {
                ... on DraftIssue {
                  id
                  title
                  body
                }
                ... on Issue {
                  id
                  url
                }
                ... on PullRequest {
                  id
                  url
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
    const result = await graphqlWithAuth(query, { projectId, cursor });
    allItems = allItems.concat(result.node.items.nodes);
    hasNextPage = result.node.items.pageInfo.hasNextPage;
    cursor = result.node.items.pageInfo.endCursor;
  }

  return allItems;
}

/**
 * Sync all tasks to master board
 */
async function syncToMasterBoard() {
  console.log('Starting sync to master board...\n');

  // Fetch all tasks
  console.log('=== Fetching GitHub tasks ===');
  const githubTasks = await fetchAllGitHubTasks();

  console.log('\n=== Fetching Asana tasks ===');
  const { tasks: asanaTasks } = await fetchAllAsanaTasks();

  const allTasks = [...githubTasks, ...asanaTasks];
  console.log(`\n=== Total tasks to sync: ${allTasks.length} ===\n`);

  // Get master project details
  console.log('Getting master project details...');
  const masterProject = await getMasterProjectId();
  console.log(`Master Project: ${masterProject.title} (${masterProject.id})`);

  // Find Status field
  const statusField = masterProject.fields.nodes.find(
    field => field.name === 'Status' && field.options
  );

  if (!statusField) {
    throw new Error('Status field not found in master project');
  }

  console.log(`Status field ID: ${statusField.id}`);
  console.log(`Status options: ${statusField.options.map(o => o.name).join(', ')}\n`);

  // Get existing items to track what's already in the board
  console.log('Fetching existing items...');
  const existingItems = await getExistingItems(masterProject.id);
  console.log(`Found ${existingItems.length} existing items\n`);

  // Create a map of existing items by URL or title
  const existingUrls = new Set(
    existingItems
      .map(item => item.content?.url)
      .filter(url => url)
  );

  // Track sync statistics
  const stats = {
    created: 0,
    skipped: 0,
    errors: 0,
  };

  // Sync each task
  for (const task of allTasks) {
    try {
      // Skip if already exists (for GitHub issues/PRs with URLs)
      if (task.url && existingUrls.has(task.url)) {
        console.log(`⊘ Skipped (exists): ${task.title}`);
        stats.skipped++;
        continue;
      }

      // Map status
      const mappedStatus = mapStatus(
        task.status,
        task.source.platform,
        task.source.projectGid
      );

      const statusOption = statusField.options.find(
        opt => opt.name === mappedStatus
      );

      if (!statusOption) {
        console.log(`⚠ Warning: Status "${mappedStatus}" not found, using default`);
      }

      // Create draft issue with all details
      const body = `
**Source**: ${task.source.platform.toUpperCase()} - ${task.source.projectName}
**Original Status**: ${task.status}
**Assignee**: ${task.primaryAssignee || 'Unassigned'}
**URL**: ${task.url || 'N/A'}
${task.repository ? `**Repository**: ${task.repository}` : ''}
${task.labels && task.labels.length > 0 ? `**Labels**: ${task.labels.join(', ')}` : ''}

---
${task.description || task.notes || 'No description'}
      `.trim();

      const itemId = await createDraftIssue(
        masterProject.id,
        `[${task.source.projectName}] ${task.title}`,
        body,
        task.assignees
      );

      // Update status if option found
      if (statusOption) {
        await updateItemStatus(
          masterProject.id,
          itemId,
          statusField.id,
          statusOption.id
        );
      }

      console.log(`✓ Created: ${task.title} [${mappedStatus}]`);
      stats.created++;

      // Rate limiting - small delay between creates
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`✗ Error syncing "${task.title}": ${error.message}`);
      stats.errors++;
    }
  }

  // Save sync report
  const syncReport = {
    timestamp: new Date().toISOString(),
    stats,
    tasksByProject: allTasks.reduce((acc, task) => {
      const key = task.source.projectName;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    tasksByStatus: allTasks.reduce((acc, task) => {
      const mapped = mapStatus(task.status, task.source.platform, task.source.projectGid);
      acc[mapped] = (acc[mapped] || 0) + 1;
      return acc;
    }, {}),
  };

  const reportPath = path.join(__dirname, '../reports/sync-report.json');
  await fs.writeFile(reportPath, JSON.stringify(syncReport, null, 2));

  console.log('\n=== Sync Complete ===');
  console.log(`✓ Created: ${stats.created}`);
  console.log(`⊘ Skipped: ${stats.skipped}`);
  console.log(`✗ Errors: ${stats.errors}`);
  console.log(`\nReport saved to: ${reportPath}`);

  return syncReport;
}

// Run if called directly
if (require.main === module) {
  syncToMasterBoard()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { syncToMasterBoard, mapStatus };
