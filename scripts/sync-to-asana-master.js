/**
 * Sync tasks from all projects to Asana Master Dashboard
 * Creates tasks in the master project with links back to source
 */

const asana = require('asana');
const fs = require('fs').promises;
const path = require('path');
const { fetchAllGitHubTasks } = require('./fetch-github-tasks');
const { fetchAllAsanaTasks } = require('./fetch-asana-tasks');
require('dotenv').config();

// Initialize Asana API client
const client = asana.ApiClient.instance;
const token = client.authentications['token'];
token.accessToken = process.env.ASANA_TOKEN;

const tasksApi = new asana.TasksApi();
const projectsApi = new asana.ProjectsApi();

// Master project configuration
const MASTER_PROJECT_GID = '1213645932471387';

// Section GIDs (status columns)
const SECTIONS = {
  'Backlog': '1213645932471415',
  'Ready': '1213646009561289',
  'In Progress': '1213646032703367',
  'Blocked': '1213645919286481',
  'Done': '1213646032703369'
};

/**
 * Map source status to master board section
 */
function mapStatus(sourceStatus, platform, projectGid = null) {
  const mapping = require('../config/status-mapping.json');

  let mappedStatus;

  if (platform === 'github') {
    mappedStatus = mapping.mappings.github[sourceStatus] || mapping.defaultMapping;
  } else if (platform === 'asana') {
    if (projectGid && mapping.mappings.asana.project_specific[projectGid]) {
      const projectMapping = mapping.mappings.asana.project_specific[projectGid];
      mappedStatus = projectMapping[sourceStatus] || mapping.mappings.asana.default[sourceStatus] || mapping.defaultMapping;
    } else {
      mappedStatus = mapping.mappings.asana.default[sourceStatus] || mapping.defaultMapping;
    }
  } else {
    mappedStatus = mapping.defaultMapping;
  }

  return mappedStatus;
}

/**
 * Get existing tasks in master project
 */
async function getExistingTasks() {
  try {
    const result = await tasksApi.getTasksForProject(MASTER_PROJECT_GID, {
      opt_fields: 'name,notes,external'
    });

    const tasks = result.data;
    const taskMap = new Map();

    // Create map of external URL -> task GID for deduplication
    tasks.forEach(task => {
      if (task.notes) {
        // Extract source URL from notes
        const urlMatch = task.notes.match(/\*\*Source URL\*\*: (https:\/\/[^\s\n]+)/);
        if (urlMatch) {
          taskMap.set(urlMatch[1], task.gid);
        }
      }
    });

    return taskMap;
  } catch (error) {
    console.error('Error fetching existing tasks:', error.message);
    return new Map();
  }
}

/**
 * Create task in master project
 */
async function createTaskInMaster(task, sectionGid) {
  const mappedStatus = mapStatus(task.status, task.source.platform, task.source.projectGid);
  const targetSectionGid = SECTIONS[mappedStatus] || SECTIONS['Backlog'];

  // Build task description
  const description = `
**Source**: ${task.source.platform.toUpperCase()} - ${task.source.projectName}
**Original Status**: ${task.status}
**Mapped Status**: ${mappedStatus}
**Assignee**: ${task.primaryAssignee || 'Unassigned'}
**Source URL**: ${task.url || 'N/A'}
${task.repository ? `**Repository**: ${task.repository}` : ''}
${task.labels && task.labels.length > 0 ? `**Labels**: ${task.labels.join(', ')}` : ''}

---
${task.description || task.notes || 'No description available'}
  `.trim();

  // Task name with source indicator
  const taskName = `[${task.source.projectName}] ${task.title}`;

  try {
    const result = await tasksApi.createTask({
      data: {
        name: taskName,
        notes: description,
        projects: [MASTER_PROJECT_GID],
        memberships: [{
          project: MASTER_PROJECT_GID,
          section: targetSectionGid
        }]
      }
    }, {});

    return result.data;
  } catch (error) {
    throw new Error(`Failed to create task: ${error.message}`);
  }
}

/**
 * Main sync function
 */
async function syncToAsanaMaster() {
  console.log('Starting sync to Asana Master Dashboard...\n');

  // Fetch all tasks
  console.log('=== Fetching GitHub tasks ===');
  const githubTasks = await fetchAllGitHubTasks();

  console.log('\n=== Fetching Asana tasks ===');
  const { tasks: asanaTasks } = await fetchAllAsanaTasks();

  const allTasks = [...githubTasks, ...asanaTasks];
  console.log(`\n=== Total tasks to sync: ${allTasks.length} ===\n`);

  // Get existing tasks to avoid duplicates
  console.log('Fetching existing tasks in master dashboard...');
  const existingTasks = await getExistingTasks();
  console.log(`Found ${existingTasks.size} existing tasks\n`);

  // Sync statistics
  const stats = {
    created: 0,
    skipped: 0,
    errors: 0
  };

  // Process each task
  for (const task of allTasks) {
    try {
      // Skip if already exists
      if (task.url && existingTasks.has(task.url)) {
        console.log(`⊘ Skipped (exists): ${task.title}`);
        stats.skipped++;
        continue;
      }

      // Create task in master project
      const mappedStatus = mapStatus(task.status, task.source.platform, task.source.projectGid);
      const createdTask = await createTaskInMaster(task, SECTIONS[mappedStatus]);

      console.log(`✓ Created: ${task.title} [${mappedStatus}]`);
      stats.created++;

      // Rate limiting - small delay
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`✗ Error syncing "${task.title}": ${error.message}`);
      stats.errors++;
    }
  }

  // Save sync report
  const syncReport = {
    timestamp: new Date().toISOString(),
    masterProjectGid: MASTER_PROJECT_GID,
    masterProjectUrl: `https://app.asana.com/1/8559678460204/project/${MASTER_PROJECT_GID}`,
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
    }, {})
  };

  const reportPath = path.join(__dirname, '../reports/sync-report.json');
  await fs.writeFile(reportPath, JSON.stringify(syncReport, null, 2));

  console.log('\n=== Sync Complete ===');
  console.log(`✓ Created: ${stats.created}`);
  console.log(`⊘ Skipped: ${stats.skipped}`);
  console.log(`✗ Errors: ${stats.errors}`);
  console.log(`\nMaster Dashboard: https://app.asana.com/1/8559678460204/project/${MASTER_PROJECT_GID}`);
  console.log(`Report saved to: ${reportPath}`);

  return syncReport;
}

// Run if called directly
if (require.main === module) {
  syncToAsanaMaster()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { syncToAsanaMaster };
