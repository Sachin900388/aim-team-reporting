/**
 * Clear all tasks from Asana Master Dashboard
 * Use this before re-syncing to get fresh tasks with assignees
 */

const asana = require('asana');
require('dotenv').config();

// Initialize Asana API client
const client = asana.ApiClient.instance;
const token = client.authentications['token'];
token.accessToken = process.env.ASANA_TOKEN;

const tasksApi = new asana.TasksApi();

// Master project GID
const MASTER_PROJECT_GID = '1213645932471387';

async function clearMasterDashboard() {
  console.log('Clearing Asana Master Dashboard...\n');
  console.log(`Project: https://app.asana.com/1/8559678460204/project/${MASTER_PROJECT_GID}\n`);

  try {
    // Fetch all tasks in the project
    console.log('Fetching all tasks...');
    const result = await tasksApi.getTasksForProject(MASTER_PROJECT_GID, {
      opt_fields: 'name,gid'
    });

    const tasks = result.data;
    console.log(`Found ${tasks.length} tasks to delete\n`);

    if (tasks.length === 0) {
      console.log('✓ Dashboard is already empty!');
      return;
    }

    // Delete each task
    let deleted = 0;
    let errors = 0;

    for (const task of tasks) {
      try {
        await tasksApi.deleteTask(task.gid);
        deleted++;
        console.log(`✓ Deleted [${deleted}/${tasks.length}]: ${task.name.substring(0, 60)}...`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        errors++;
        console.error(`✗ Error deleting task ${task.gid}: ${error.message}`);
      }
    }

    console.log('\n=== Clear Complete ===');
    console.log(`✓ Deleted: ${deleted} tasks`);
    console.log(`✗ Errors: ${errors}`);
    console.log('\nReady for re-sync! Run: npm run sync');

  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run
clearMasterDashboard()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
