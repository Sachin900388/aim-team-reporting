/**
 * Generate daily standup report
 * Shows tasks moved today and current blockers
 */

const fs = require('fs').promises;
const path = require('path');
const { format, subDays, startOfDay } = require('date-fns');

/**
 * Load tasks from JSON files
 */
async function loadTasks() {
  const githubPath = path.join(__dirname, '../reports/github-tasks.json');
  const asanaPath = path.join(__dirname, '../reports/asana-tasks.json');

  let githubTasks = [];
  let asanaTasks = [];

  try {
    githubTasks = JSON.parse(await fs.readFile(githubPath, 'utf-8'));
  } catch (error) {
    console.log('No GitHub tasks found');
  }

  try {
    asanaTasks = JSON.parse(await fs.readFile(asanaPath, 'utf-8'));
  } catch (error) {
    console.log('No Asana tasks found');
  }

  return [...githubTasks, ...asanaTasks];
}

/**
 * Load sync report to get historical data
 */
async function loadSyncReport() {
  const reportPath = path.join(__dirname, '../reports/sync-report.json');
  try {
    return JSON.parse(await fs.readFile(reportPath, 'utf-8'));
  } catch (error) {
    return null;
  }
}

/**
 * Filter tasks updated today
 */
function getTasksUpdatedToday(tasks) {
  const today = startOfDay(new Date());

  return tasks.filter(task => {
    const updatedDate = task.updatedAt ? new Date(task.updatedAt) : null;
    return updatedDate && startOfDay(updatedDate).getTime() === today.getTime();
  });
}

/**
 * Get blocked tasks
 */
function getBlockedTasks(tasks) {
  return tasks.filter(task =>
    task.status.toLowerCase().includes('blocked') ||
    task.status.toLowerCase().includes('waiting')
  );
}

/**
 * Group tasks by developer
 */
function groupTasksByDeveloper(tasks) {
  const grouped = {};

  tasks.forEach(task => {
    const dev = task.primaryAssignee || 'Unassigned';
    if (!grouped[dev]) {
      grouped[dev] = [];
    }
    grouped[dev].push(task);
  });

  return grouped;
}

/**
 * Group tasks by status
 */
function groupTasksByStatus(tasks) {
  const { mapStatus } = require('./sync-to-master-board');
  const grouped = {};

  tasks.forEach(task => {
    const status = mapStatus(task.status, task.source.platform, task.source.projectGid);
    if (!grouped[status]) {
      grouped[status] = [];
    }
    grouped[status].push(task);
  });

  return grouped;
}

/**
 * Generate markdown for standup report
 */
function generateStandupMarkdown(tasks, todaysTasks, blockedTasks, syncReport) {
  const today = format(new Date(), 'EEEE, MMMM d, yyyy');
  const tasksByDev = groupTasksByDeveloper(tasks);
  const tasksByStatus = groupTasksByStatus(tasks);
  const todaysByDev = groupTasksByDeveloper(todaysTasks);
  const blockedByDev = groupTasksByDeveloper(blockedTasks);

  let md = `# Daily Standup Report\n\n`;
  md += `**Date**: ${today}\n\n`;
  md += `---\n\n`;

  // Overview
  md += `## 📊 Overview\n\n`;
  md += `- **Total Active Tasks**: ${tasks.length}\n`;
  md += `- **Tasks Updated Today**: ${todaysTasks.length}\n`;
  md += `- **Blocked Tasks**: ${blockedTasks.length}\n`;
  md += `- **Team Members Active**: ${Object.keys(tasksByDev).length}\n\n`;

  // Tasks by Status
  md += `## 📋 Tasks by Status\n\n`;
  Object.entries(tasksByStatus)
    .sort(([a], [b]) => {
      const order = ['Backlog', 'Ready', 'In Progress', 'Blocked', 'Done'];
      return order.indexOf(a) - order.indexOf(b);
    })
    .forEach(([status, statusTasks]) => {
      md += `- **${status}**: ${statusTasks.length}\n`;
    });
  md += `\n`;

  // Tasks Updated Today
  if (todaysTasks.length > 0) {
    md += `## 🔄 Tasks Updated Today (${todaysTasks.length})\n\n`;

    Object.entries(todaysByDev).forEach(([dev, devTasks]) => {
      md += `### ${dev} (${devTasks.length})\n\n`;
      devTasks.forEach(task => {
        const status = mapStatus(task.status, task.source.platform, task.source.projectGid);
        md += `- [${status}] **${task.title}**\n`;
        md += `  - Project: ${task.source.projectName}\n`;
        md += `  - URL: ${task.url || 'N/A'}\n`;
      });
      md += `\n`;
    });
  } else {
    md += `## 🔄 Tasks Updated Today\n\n`;
    md += `_No tasks were updated today._\n\n`;
  }

  // Blocked Tasks
  if (blockedTasks.length > 0) {
    md += `## 🚧 Blocked Tasks (${blockedTasks.length})\n\n`;

    Object.entries(blockedByDev).forEach(([dev, devTasks]) => {
      md += `### ${dev} (${devTasks.length})\n\n`;
      devTasks.forEach(task => {
        md += `- **${task.title}**\n`;
        md += `  - Project: ${task.source.projectName}\n`;
        md += `  - Status: ${task.status}\n`;
        md += `  - URL: ${task.url || 'N/A'}\n`;

        // Try to extract blocker info from description
        if (task.notes && task.notes.toLowerCase().includes('blocked')) {
          md += `  - Details: _See task description_\n`;
        }
      });
      md += `\n`;
    });
  } else {
    md += `## 🚧 Blocked Tasks\n\n`;
    md += `_No tasks are currently blocked. Great!_\n\n`;
  }

  // Team Activity
  md += `## 👥 Team Activity Summary\n\n`;
  md += `| Developer | Total Tasks | In Progress | Blocked |\n`;
  md += `|-----------|-------------|-------------|----------|\n`;

  Object.entries(tasksByDev)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([dev, devTasks]) => {
      const inProgress = devTasks.filter(t => {
        const status = mapStatus(t.status, t.source.platform, t.source.projectGid);
        return status === 'In Progress';
      }).length;
      const blocked = devTasks.filter(t => {
        const status = mapStatus(t.status, t.source.platform, t.source.projectGid);
        return status === 'Blocked';
      }).length;

      md += `| ${dev} | ${devTasks.length} | ${inProgress} | ${blocked} |\n`;
    });

  md += `\n`;

  // Footer
  md += `---\n\n`;
  md += `_Generated on ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}_\n`;
  if (syncReport) {
    md += `_Last sync: ${format(new Date(syncReport.timestamp), 'yyyy-MM-dd HH:mm:ss')}_\n`;
  }

  return md;
}

// Helper to map status (import from sync script)
function mapStatus(sourceStatus, platform, projectGid = null) {
  const mapping = require('../config/status-mapping.json');

  if (platform === 'github') {
    return mapping.mappings.github[sourceStatus] || mapping.defaultMapping;
  }

  if (platform === 'asana') {
    if (projectGid && mapping.mappings.asana.project_specific[projectGid]) {
      const projectMapping = mapping.mappings.asana.project_specific[projectGid];
      if (projectMapping[sourceStatus]) {
        return projectMapping[sourceStatus];
      }
    }
    return mapping.mappings.asana.default[sourceStatus] || mapping.defaultMapping;
  }

  return mapping.defaultMapping;
}

/**
 * Main function to generate standup report
 */
async function generateStandup() {
  console.log('Generating daily standup report...\n');

  const tasks = await loadTasks();
  const syncReport = await loadSyncReport();

  console.log(`Loaded ${tasks.length} tasks`);

  const todaysTasks = getTasksUpdatedToday(tasks);
  const blockedTasks = getBlockedTasks(tasks);

  console.log(`Tasks updated today: ${todaysTasks.length}`);
  console.log(`Blocked tasks: ${blockedTasks.length}`);

  const markdown = generateStandupMarkdown(tasks, todaysTasks, blockedTasks, syncReport);

  // Save report
  const dateStr = format(new Date(), 'yyyy-MM-dd');
  const reportPath = path.join(__dirname, `../reports/daily/standup-${dateStr}.md`);

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, markdown);

  console.log(`\n✓ Standup report saved to: ${reportPath}`);

  return { reportPath, tasks, todaysTasks, blockedTasks };
}

// Run if called directly
if (require.main === module) {
  generateStandup()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { generateStandup };
