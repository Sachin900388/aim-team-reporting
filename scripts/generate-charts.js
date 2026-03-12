/**
 * Generate burndown/burnup charts
 * Creates ASCII charts and data for visualization
 */

const fs = require('fs').promises;
const path = require('path');
const { format, subDays, startOfWeek, eachDayOfInterval, addDays } = require('date-fns');

/**
 * Load historical metrics
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
 * Load tasks
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
 * Generate burndown chart data
 * Shows remaining work over time
 */
function generateBurndownData(historicalMetrics, currentWeekStart) {
  const weekStart = new Date(currentWeekStart);
  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: addDays(weekStart, 6),
  });

  // Get initial task count (start of week)
  const initialCount = historicalMetrics.length > 0
    ? historicalMetrics[historicalMetrics.length - 1].total
    : 0;

  // Calculate ideal burndown (linear)
  const idealBurndown = weekDays.map((day, index) => ({
    date: format(day, 'yyyy-MM-dd'),
    ideal: Math.round(initialCount * (1 - (index + 1) / 7)),
  }));

  // Calculate actual remaining work
  // Note: This is simplified - in production you'd track daily snapshots
  const actualRemaining = weekDays.map((day, index) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const metric = historicalMetrics.find(m => m.weekStart === dayStr);

    return {
      date: dayStr,
      actual: metric ? metric.total - metric.completed : initialCount,
    };
  });

  return {
    initialCount,
    days: weekDays.map((day, index) => ({
      date: format(day, 'MMM d'),
      ideal: idealBurndown[index].ideal,
      actual: actualRemaining[index].actual,
    })),
  };
}

/**
 * Generate burnup chart data
 * Shows completed work over time
 */
function generateBurnupData(historicalMetrics) {
  if (historicalMetrics.length === 0) {
    return { weeks: [], maxValue: 0 };
  }

  const recentWeeks = historicalMetrics.slice(-8); // Last 8 weeks

  const data = recentWeeks.map(metric => ({
    week: format(new Date(metric.weekStart), 'MMM d'),
    total: metric.total,
    completed: metric.completed,
  }));

  const maxValue = Math.max(...data.map(d => d.total));

  return { weeks: data, maxValue };
}

/**
 * Generate ASCII bar chart
 */
function generateASCIIBarChart(data, maxValue, width = 40) {
  const lines = [];

  data.forEach(item => {
    const label = item.label.padEnd(20);
    const value = item.value;
    const barLength = Math.round((value / maxValue) * width);
    const bar = '█'.repeat(barLength);
    const valueStr = String(value).padStart(4);

    lines.push(`${label} ${bar} ${valueStr}`);
  });

  return lines.join('\n');
}

/**
 * Generate markdown with charts
 */
function generateChartsMarkdown(tasks, burndownData, burnupData, historicalMetrics) {
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d, yyyy');

  let md = `# Burndown & Burnup Charts\n\n`;
  md += `**Week Starting**: ${weekStart}\n\n`;
  md += `---\n\n`;

  // Burndown Chart
  md += `## 📉 Burndown Chart (Current Week)\n\n`;
  md += `Shows remaining work vs. ideal burndown rate.\n\n`;

  if (burndownData.days.length > 0) {
    md += `\`\`\`\n`;
    md += `Tasks Remaining\n`;
    md += `${burndownData.initialCount} ┤\n`;

    const maxVal = burndownData.initialCount;
    burndownData.days.forEach((day, index) => {
      const idealBar = '·'.repeat(Math.round((day.ideal / maxVal) * 40));
      const actualBar = '█'.repeat(Math.round((day.actual / maxVal) * 40));

      md += `       │ ${day.date}\n`;
      md += `       │   Ideal:  ${idealBar} ${day.ideal}\n`;
      md += `       │   Actual: ${actualBar} ${day.actual}\n`;
    });

    md += `     0 └${'─'.repeat(50)}\n`;
    md += `\`\`\`\n\n`;
  } else {
    md += `_Insufficient data for burndown chart_\n\n`;
  }

  // Burnup Chart
  md += `## 📈 Burnup Chart (Last 8 Weeks)\n\n`;
  md += `Shows total tasks and completed tasks over time.\n\n`;

  if (burnupData.weeks.length > 0) {
    md += `\`\`\`\n`;
    burnupData.weeks.forEach(week => {
      const totalBar = '█'.repeat(Math.round((week.total / burnupData.maxValue) * 40));
      const completedBar = '▓'.repeat(Math.round((week.completed / burnupData.maxValue) * 40));

      md += `${week.week.padEnd(10)} │ Total:     ${totalBar} ${week.total}\n`;
      md += `${''.padEnd(10)} │ Completed: ${completedBar} ${week.completed}\n`;
      md += `\n`;
    });
    md += `\`\`\`\n\n`;
  } else {
    md += `_Insufficient historical data for burnup chart_\n\n`;
  }

  // Velocity Chart
  md += `## ⚡ Velocity Trend\n\n`;
  if (historicalMetrics.length >= 4) {
    const recentMetrics = historicalMetrics.slice(-8);
    const maxCompleted = Math.max(...recentMetrics.map(m => m.completed));

    md += `\`\`\`\n`;
    recentMetrics.forEach(metric => {
      const week = format(new Date(metric.weekStart), 'MMM d');
      const bar = '█'.repeat(Math.round((metric.completed / maxCompleted) * 40));
      md += `${week.padEnd(10)} ${bar} ${metric.completed} tasks\n`;
    });
    md += `\`\`\`\n\n`;

    const avgVelocity = Math.round(
      recentMetrics.reduce((sum, m) => sum + m.completed, 0) / recentMetrics.length
    );
    md += `**Average Velocity**: ${avgVelocity} tasks/week\n\n`;
  } else {
    md += `_Need at least 4 weeks of data for velocity trend_\n\n`;
  }

  // Status Distribution
  md += `## 📊 Current Status Distribution\n\n`;
  const statusCounts = {};
  tasks.forEach(task => {
    const status = task.status;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  const maxCount = Math.max(...Object.values(statusCounts));
  md += `\`\`\`\n`;
  Object.entries(statusCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([status, count]) => {
      const bar = '█'.repeat(Math.round((count / maxCount) * 40));
      md += `${status.padEnd(20)} ${bar} ${count}\n`;
    });
  md += `\`\`\`\n\n`;

  // Data Export for External Visualization
  md += `## 📁 Data Export\n\n`;
  md += `Chart data has been saved to JSON files for external visualization tools:\n\n`;
  md += `- \`reports/weekly/burndown-data.json\`\n`;
  md += `- \`reports/weekly/burnup-data.json\`\n`;
  md += `- \`reports/weekly/velocity-data.json\`\n\n`;

  md += `---\n\n`;
  md += `_Generated on ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}_\n`;

  return md;
}

/**
 * Main function to generate charts
 */
async function generateCharts() {
  console.log('Generating burndown/burnup charts...\n');

  const tasks = await loadTasks();
  const historicalMetrics = await loadHistoricalMetrics();

  console.log(`Loaded ${tasks.length} tasks`);
  console.log(`Historical data: ${historicalMetrics.length} weeks`);

  const currentWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const burndownData = generateBurndownData(historicalMetrics, currentWeekStart);
  const burnupData = generateBurnupData(historicalMetrics);

  // Generate markdown report
  const markdown = generateChartsMarkdown(tasks, burndownData, burnupData, historicalMetrics);

  const weekStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const reportPath = path.join(__dirname, `../reports/weekly/charts-${weekStr}.md`);

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, markdown);

  // Export chart data as JSON
  const burndownPath = path.join(__dirname, '../reports/weekly/burndown-data.json');
  await fs.writeFile(burndownPath, JSON.stringify(burndownData, null, 2));

  const burnupPath = path.join(__dirname, '../reports/weekly/burnup-data.json');
  await fs.writeFile(burnupPath, JSON.stringify(burnupData, null, 2));

  const velocityData = historicalMetrics.slice(-8).map(m => ({
    week: m.weekStart,
    completed: m.completed,
    total: m.total,
  }));
  const velocityPath = path.join(__dirname, '../reports/weekly/velocity-data.json');
  await fs.writeFile(velocityPath, JSON.stringify(velocityData, null, 2));

  console.log(`\n✓ Charts report saved to: ${reportPath}`);
  console.log(`✓ Chart data exported to JSON files`);

  return { reportPath, burndownData, burnupData };
}

// Run if called directly
if (require.main === module) {
  generateCharts()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { generateCharts };
