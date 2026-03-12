/**
 * Generate weekly sprint metrics
 * Calculates velocity, completion rate, and trends
 */

const fs = require('fs').promises;
const path = require('path');
const { format, subDays, startOfWeek, endOfWeek, isWithinInterval } = require('date-fns');

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
 * Load historical metrics if available
 */
async function loadHistoricalMetrics() {
  const metricsPath = path.join(__dirname, '../reports/weekly/metrics-history.json');
  try {
    return JSON.parse(await fs.readFile(metricsPath, 'utf-8'));
  } catch (error) {
    return [];
  }
}

/**
 * Get tasks completed this week
 */
function getTasksCompletedThisWeek(tasks) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  return tasks.filter(task => {
    // Check if task is completed
    const isCompleted =
      task.completed ||
      task.state === 'closed' ||
      task.status === 'Done' ||
      task.status === 'Complete' ||
      task.status === 'Completed';

    if (!isCompleted) return false;

    // Check completion date
    const completionDate = task.completedAt || task.closedAt || task.mergedAt;
    if (!completionDate) return false;

    const date = new Date(completionDate);
    return isWithinInterval(date, { start: weekStart, end: weekEnd });
  });
}

/**
 * Get tasks in progress this week
 */
function getTasksInProgress(tasks) {
  return tasks.filter(task => {
    const status = task.status.toLowerCase();
    return status.includes('progress') || status.includes('review');
  });
}

/**
 * Calculate velocity (tasks completed per week)
 */
function calculateVelocity(historicalMetrics) {
  if (historicalMetrics.length === 0) return 0;

  const recentWeeks = historicalMetrics.slice(-4); // Last 4 weeks
  const totalCompleted = recentWeeks.reduce((sum, week) => sum + week.completed, 0);

  return Math.round(totalCompleted / recentWeeks.length);
}

/**
 * Calculate completion rate
 */
function calculateCompletionRate(completedThisWeek, totalTasks) {
  if (totalTasks === 0) return 0;
  return Math.round((completedThisWeek / totalTasks) * 100);
}

/**
 * Group tasks by developer
 */
function groupTasksByDeveloper(tasks) {
  const grouped = {};

  tasks.forEach(task => {
    const dev = task.primaryAssignee || 'Unassigned';
    if (!grouped[dev]) {
      grouped[dev] = {
        total: 0,
        completed: 0,
        inProgress: 0,
        blocked: 0,
      };
    }
    grouped[dev].total++;

    const status = task.status.toLowerCase();
    if (status.includes('done') || status.includes('complete') || task.completed) {
      grouped[dev].completed++;
    } else if (status.includes('progress') || status.includes('review')) {
      grouped[dev].inProgress++;
    } else if (status.includes('blocked') || status.includes('waiting')) {
      grouped[dev].blocked++;
    }
  });

  return grouped;
}

/**
 * Group tasks by project
 */
function groupTasksByProject(tasks) {
  const grouped = {};

  tasks.forEach(task => {
    const project = task.source.projectName;
    if (!grouped[project]) {
      grouped[project] = {
        total: 0,
        completed: 0,
        inProgress: 0,
      };
    }
    grouped[project].total++;

    const status = task.status.toLowerCase();
    if (status.includes('done') || status.includes('complete') || task.completed) {
      grouped[project].completed++;
    } else if (status.includes('progress') || status.includes('review')) {
      grouped[project].inProgress++;
    }
  });

  return grouped;
}

/**
 * Generate markdown for weekly metrics
 */
function generateMetricsMarkdown(tasks, completedThisWeek, metrics) {
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d, yyyy');
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d, yyyy');

  let md = `# Weekly Sprint Metrics\n\n`;
  md += `**Week of**: ${weekStart} - ${weekEnd}\n\n`;
  md += `---\n\n`;

  // Key Metrics
  md += `## 📈 Key Metrics\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Active Tasks | ${tasks.length} |\n`;
  md += `| Completed This Week | ${completedThisWeek.length} |\n`;
  md += `| In Progress | ${metrics.inProgress} |\n`;
  md += `| Blocked | ${metrics.blocked} |\n`;
  md += `| Completion Rate | ${metrics.completionRate}% |\n`;
  md += `| Average Velocity | ${metrics.velocity} tasks/week |\n`;
  md += `\n`;

  // Completion Trend
  if (metrics.trend) {
    md += `## 📊 Trend\n\n`;
    md += `Completion trend compared to last week: **${metrics.trend}**\n\n`;
  }

  // Tasks by Developer
  md += `## 👥 Developer Breakdown\n\n`;
  md += `| Developer | Total | Completed | In Progress | Blocked | Completion % |\n`;
  md += `|-----------|-------|-----------|-------------|---------|-------------|\n`;

  Object.entries(metrics.byDeveloper)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([dev, stats]) => {
      const completionPct = stats.total > 0
        ? Math.round((stats.completed / stats.total) * 100)
        : 0;
      md += `| ${dev} | ${stats.total} | ${stats.completed} | ${stats.inProgress} | ${stats.blocked} | ${completionPct}% |\n`;
    });

  md += `\n`;

  // Tasks by Project
  md += `## 📁 Project Breakdown\n\n`;
  md += `| Project | Total | Completed | In Progress | Completion % |\n`;
  md += `|---------|-------|-----------|-------------|-------------|\n`;

  Object.entries(metrics.byProject)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([project, stats]) => {
      const completionPct = stats.total > 0
        ? Math.round((stats.completed / stats.total) * 100)
        : 0;
      md += `| ${project} | ${stats.total} | ${stats.completed} | ${stats.inProgress} | ${completionPct}% |\n`;
    });

  md += `\n`;

  // Top Performers
  const topPerformers = Object.entries(metrics.byDeveloper)
    .filter(([dev]) => dev !== 'Unassigned')
    .sort(([, a], [, b]) => b.completed - a.completed)
    .slice(0, 3);

  if (topPerformers.length > 0) {
    md += `## 🏆 Top Performers This Week\n\n`;
    topPerformers.forEach(([dev, stats], index) => {
      md += `${index + 1}. **${dev}** - ${stats.completed} tasks completed\n`;
    });
    md += `\n`;
  }

  // Footer
  md += `---\n\n`;
  md += `_Generated on ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}_\n`;

  return md;
}

/**
 * Main function to generate weekly metrics
 */
async function generateMetrics() {
  console.log('Generating weekly metrics...\n');

  const tasks = await loadTasks();
  const historicalMetrics = await loadHistoricalMetrics();

  console.log(`Loaded ${tasks.length} tasks`);

  const completedThisWeek = getTasksCompletedThisWeek(tasks);
  const inProgressTasks = getTasksInProgress(tasks);
  const blockedTasks = tasks.filter(t => t.status.toLowerCase().includes('blocked'));

  const velocity = calculateVelocity(historicalMetrics);
  const completionRate = calculateCompletionRate(completedThisWeek.length, tasks.length);

  const byDeveloper = groupTasksByDeveloper(tasks);
  const byProject = groupTasksByProject(tasks);

  // Determine trend
  let trend = 'Stable';
  if (historicalMetrics.length > 0) {
    const lastWeek = historicalMetrics[historicalMetrics.length - 1];
    if (completedThisWeek.length > lastWeek.completed) {
      trend = 'Improving ↗';
    } else if (completedThisWeek.length < lastWeek.completed) {
      trend = 'Declining ↘';
    }
  }

  const metrics = {
    weekStart: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    completed: completedThisWeek.length,
    inProgress: inProgressTasks.length,
    blocked: blockedTasks.length,
    total: tasks.length,
    velocity,
    completionRate,
    trend,
    byDeveloper,
    byProject,
  };

  // Save metrics to history
  historicalMetrics.push(metrics);
  const historyPath = path.join(__dirname, '../reports/weekly/metrics-history.json');
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.writeFile(historyPath, JSON.stringify(historicalMetrics, null, 2));

  // Generate markdown report
  const markdown = generateMetricsMarkdown(tasks, completedThisWeek, metrics);

  const weekStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const reportPath = path.join(__dirname, `../reports/weekly/metrics-${weekStr}.md`);
  await fs.writeFile(reportPath, markdown);

  console.log(`\n✓ Weekly metrics saved to: ${reportPath}`);
  console.log(`✓ Metrics history updated: ${historyPath}`);

  return { metrics, reportPath };
}

// Run if called directly
if (require.main === module) {
  generateMetrics()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { generateMetrics };
