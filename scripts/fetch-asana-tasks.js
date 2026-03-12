/**
 * Fetch tasks from Asana projects
 * Filters tasks assigned to team members from developers aim.csv
 */

const asana = require('asana');
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

// Initialize Asana API client
const client = asana.ApiClient.instance;
const token = client.authentications['token'];
token.accessToken = process.env.ASANA_TOKEN;

const tasksApi = new asana.TasksApi();
const projectsApi = new asana.ProjectsApi();

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
    name: record.name?.trim(),
    gid: record.gid?.trim(),
    email: record.email?.trim(),
    githubUser: record.github_user?.trim(),
    team: record.team?.trim(),
  })).filter(member => member.gid);
}

/**
 * Fetch tasks from an Asana project
 */
async function fetchProjectTasks(projectGid) {
  try {
    // Get project details
    const projectResponse = await projectsApi.getProject(projectGid, {});
    const project = projectResponse.data;

    // Fetch tasks for the project
    const tasksResponse = await tasksApi.getTasksForProject(projectGid, {
      opt_fields: 'name,notes,assignee.gid,assignee.name,assignee.email,assignee_status,completed,completed_at,created_at,modified_at,due_on,permalink_url,custom_fields.name,custom_fields.display_value,custom_fields.type,memberships.section.name,tags.name,parent.gid,parent.name',
    });

    const tasks = tasksResponse.data;

    return { project, tasks };
  } catch (error) {
    console.error(`Error fetching project ${projectGid}:`, error.message);
    throw error;
  }
}

/**
 * Filter tasks to only those assigned to team members
 * Excludes subtasks (tasks with parent)
 */
function filterTeamTasks(tasks, teamMembers, excludeSubtasks = true) {
  const teamGids = new Set(teamMembers.map(m => m.gid));

  return tasks.filter(task => {
    // Exclude subtasks if configured
    if (excludeSubtasks && task.parent) {
      return false;
    }

    // Only include if assigned to team member
    if (!task.assignee || !task.assignee.gid) {
      return false;
    }

    return teamGids.has(task.assignee.gid);
  });
}

/**
 * Extract status from Asana task
 * Checks custom fields for Status field, falls back to section name
 */
function extractStatus(task) {
  // Try to find Status custom field
  if (task.custom_fields && task.custom_fields.length > 0) {
    const statusField = task.custom_fields.find(
      field => field.name && field.name.toLowerCase().includes('status')
    );
    if (statusField && statusField.display_value) {
      return statusField.display_value;
    }
  }

  // Fall back to section name
  if (task.memberships && task.memberships.length > 0) {
    const section = task.memberships[0].section;
    if (section && section.name) {
      return section.name;
    }
  }

  // Check completion status
  if (task.completed) {
    return 'Done';
  }

  return 'Unknown';
}

/**
 * Transform Asana tasks to standardized format
 */
function transformAsanaTasks(tasks, projectName, projectId, projectGid) {
  return tasks.map(task => {
    const status = extractStatus(task);

    return {
      id: task.gid,
      title: task.name,
      url: task.permalink_url,
      type: 'ISSUE',
      status: status,
      assignees: task.assignee ? [{
        gid: task.assignee.gid,
        name: task.assignee.name,
        email: task.assignee.email,
      }] : [],
      primaryAssignee: task.assignee ? task.assignee.name : null,
      description: task.notes,
      completed: task.completed,
      completedAt: task.completed_at,
      createdAt: task.created_at,
      updatedAt: task.modified_at,
      dueOn: task.due_on,
      tags: task.tags?.map(t => t.name) || [],
      customFields: task.custom_fields?.map(cf => ({
        name: cf.name,
        value: cf.display_value,
        type: cf.type,
      })) || [],
      source: {
        platform: 'asana',
        projectName: projectName,
        projectId: projectId,
        projectGid: projectGid,
      },
    };
  });
}

/**
 * Main function to fetch all Asana tasks
 */
async function fetchAllAsanaTasks() {
  console.log('Loading team members...');
  const teamMembers = await loadTeamMembers();
  console.log(`Found ${teamMembers.length} team members with Asana accounts`);

  const projectConfig = JSON.parse(
    await fs.readFile(path.join(__dirname, '../config/project-config.json'), 'utf-8')
  );

  const allTasks = [];
  const statusDiscovery = {};

  for (const project of projectConfig.projects.asana) {
    console.log(`\nFetching project: ${project.name}`);

    try {
      const { project: projectDetails, tasks } = await fetchProjectTasks(project.projectGid);
      console.log(`  Total tasks: ${tasks.length}`);

      const teamTasks = filterTeamTasks(
        tasks,
        teamMembers,
        projectConfig.sync.filters.excludeSubtasks
      );
      console.log(`  Team member tasks: ${teamTasks.length}`);

      // Collect unique statuses for mapping
      const uniqueStatuses = new Set();
      teamTasks.forEach(task => {
        const status = extractStatus(task);
        uniqueStatuses.add(status);
      });
      statusDiscovery[project.projectGid] = Array.from(uniqueStatuses);
      console.log(`  Unique statuses: ${Array.from(uniqueStatuses).join(', ')}`);

      const transformedTasks = transformAsanaTasks(teamTasks, project.name, project.id, project.projectGid);
      allTasks.push(...transformedTasks);

    } catch (error) {
      console.error(`  Error fetching ${project.name}:`, error.message);
    }
  }

  // Save tasks to file
  const outputPath = path.join(__dirname, '../reports/asana-tasks.json');
  await fs.writeFile(outputPath, JSON.stringify(allTasks, null, 2));
  console.log(`\n✓ Saved ${allTasks.length} Asana tasks to ${outputPath}`);

  // Save status discovery for mapping configuration
  const statusPath = path.join(__dirname, '../reports/asana-status-discovery.json');
  await fs.writeFile(statusPath, JSON.stringify(statusDiscovery, null, 2));
  console.log(`✓ Saved status discovery to ${statusPath}`);

  return { tasks: allTasks, statusDiscovery };
}

// Run if called directly
if (require.main === module) {
  fetchAllAsanaTasks()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { fetchAllAsanaTasks, loadTeamMembers };
