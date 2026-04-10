import { supabase } from '../lib/supabase.js';

const TASKS_TABLE = 'app_4c3a7a6153_team_tasks';
const COMMENTS_TABLE = 'app_4c3a7a6153_task_comments';
const NOTIFICATIONS_TABLE = 'app_4c3a7a6153_task_notifications';

const normalizeTask = (task = {}) => ({
  ...task,
  assigned_user: task.assigned_user || null,
  comments: Array.isArray(task.comments) ? task.comments : [],
  comment_count: Number(task.comment_count || (Array.isArray(task.comments) ? task.comments.length : 0)),
  last_comment: task.last_comment || null,
  labels: Array.isArray(task.labels) ? task.labels : [],
});

const getTaskCommentReadMap = (userId) => {
  if (!userId || typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(`task-comments-read:${userId}`) || '{}');
  } catch {
    return {};
  }
};

const hasUnreadTaskComments = (task, userId, readMap = {}) => {
  if (!userId || task.status === 'done') return false;
  const lastComment = task.last_comment || (Array.isArray(task.comments) ? task.comments[task.comments.length - 1] : null);
  if (!lastComment?.created_at) return false;
  if (String(lastComment.created_by || '') === String(userId)) return false;
  const readAt = readMap[task.id];
  return !readAt || new Date(lastComment.created_at).getTime() > new Date(readAt).getTime();
};

const attachTaskComments = async (rows = []) => {
  const tasks = rows.map(normalizeTask);
  const taskIds = tasks.map((task) => task.id).filter(Boolean);
  if (taskIds.length === 0) return tasks;

  try {
    const { data, error } = await supabase
      .from(COMMENTS_TABLE)
      .select('id,task_id,comment,created_by,created_by_name,created_at')
      .in('task_id', taskIds)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const commentsByTask = new Map();
    (data || []).forEach((comment) => {
      const key = String(comment.task_id);
      const existing = commentsByTask.get(key) || [];
      commentsByTask.set(key, [...existing, comment]);
    });

    return tasks.map((task) => {
      const taskComments = commentsByTask.get(String(task.id)) || [];
      return normalizeTask({
        ...task,
        comments: taskComments,
        comment_count: taskComments.length,
        last_comment: taskComments[taskComments.length - 1] || null,
      });
    });
  } catch (error) {
    console.warn('Task comments unavailable:', error.message || error);
    return tasks;
  }
};

const normalizeScheduledAt = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeTaskLabels = (labels = []) => (Array.isArray(labels) ? labels : [])
  .filter((label) => label?.key && label?.emoji && label?.text)
  .map((label) => ({
    type: label.type || (label.entityType ? 'linked' : 'info'),
    key: String(label.key),
    emoji: String(label.emoji),
    text: String(label.text),
    entityType: label.entityType || null,
    entityId: label.entityId ? String(label.entityId) : null,
    href: label.href || null,
    locked: Boolean(label.locked || label.system),
    system: Boolean(label.system || label.locked),
    status: label.status || 'pending',
    completedAt: label.completedAt || null,
    completedBy: label.completedBy || null,
    completedByName: label.completedByName || null,
  }));

const isLegacyLinkedEntity = (label) => ['vehicle', 'rental', 'maintenance'].includes(String(label?.entityType || '').toLowerCase());

export const getTasks = async () => {
  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return attachTaskComments(data || []);
};

export const createTask = async (task) => {
  const labels = normalizeTaskLabels(task.labels);
  const linkedLabel = labels.find((label) => label?.entityId && isLegacyLinkedEntity(label));
  const payload = {
    title: String(task.title || '').trim(),
    description: String(task.description || '').trim() || null,
    assigned_user: task.assigned_user || null,
    created_by: task.created_by || null,
    created_by_name: task.created_by_name || null,
    assigned_user_name: task.assigned_user_name || null,
    status: task.assigned_user ? 'open' : 'open',
    priority: task.priority || 'normal',
    labels,
    linked_entity_type: linkedLabel?.entityType || task.linked_entity_type || null,
    linked_entity_id: linkedLabel?.entityId || task.linked_entity_id || null,
    scheduled_at: normalizeScheduledAt(task.scheduled_at),
  };

  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;

  if (payload.assigned_user) {
    await createTaskNotification({
      task_id: data.id,
      user_id: payload.assigned_user,
      title: 'New assigned task',
      message: payload.title,
    });
  }

  return normalizeTask(data);
};

export const claimTask = async (task, actor) => {
  if (!task?.id || !actor?.id) return null;

  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .update({
      assigned_user: actor.id,
      assigned_user_name: actor.full_name || actor.fullName || actor.name || actor.email || 'Team Member',
      claimed_by: actor.id,
      claimed_by_name: actor.full_name || actor.fullName || actor.name || actor.email || 'Team Member',
      claimed_at: new Date().toISOString(),
      status: 'claimed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id)
    .is('assigned_user', null)
    .neq('status', 'done')
    .select('*')
    .single();

  if (error) throw error;
  return normalizeTask(data);
};

export const unclaimTask = async (task, actor) => {
  if (!task?.id || !actor?.id) return null;

  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .update({
      assigned_user: null,
      assigned_user_name: null,
      claimed_by: null,
      claimed_by_name: null,
      claimed_at: null,
      status: 'open',
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id)
    .eq('assigned_user', actor.id)
    .neq('status', 'done')
    .select('*')
    .single();

  if (error) throw error;
  return normalizeTask(data);
};

export const markTaskDone = async (taskId, actor) => {
  const completedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .update({
      status: 'done',
      completed_at: completedAt,
      completed_by: actor?.id || null,
      completed_by_name: actor?.full_name || actor?.fullName || actor?.name || actor?.email || null,
      updated_at: completedAt,
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeTask(data);
};

export const updateTask = async (taskId, updates) => {
  const labels = Object.prototype.hasOwnProperty.call(updates, 'labels')
    ? normalizeTaskLabels(updates.labels)
    : null;
  const linkedLabel = labels?.find((label) => label?.entityId && isLegacyLinkedEntity(label));
  const payload = {
    ...updates,
    ...(labels ? {
      labels,
      linked_entity_type: linkedLabel?.entityType || null,
      linked_entity_id: linkedLabel?.entityId || null,
    } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'description') ? {
      description: String(updates.description || '').trim() || null,
    } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'title') ? {
      title: String(updates.title || '').trim(),
    } : {}),
    updated_at: new Date().toISOString(),
  };
  delete payload.created_by;
  delete payload.created_by_name;

  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .update(payload)
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeTask(data);
};

export const deleteTask = async (taskId) => {
  if (!taskId) return false;
  const { error } = await supabase
    .from(TASKS_TABLE)
    .delete()
    .eq('id', taskId);

  if (error) throw error;
  return true;
};

export const getTaskComments = async (taskId) => {
  const { data, error } = await supabase
    .from(COMMENTS_TABLE)
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const addTaskComment = async (taskId, comment, actor) => {
  const message = String(comment || '').trim();
  const { data, error } = await supabase
    .from(COMMENTS_TABLE)
    .insert({
      task_id: taskId,
      comment: message,
      created_by: actor?.id || null,
      created_by_name: actor?.full_name || actor?.fullName || actor?.name || actor?.email || null,
    })
    .select('*')
    .single();

  if (error) throw error;

  try {
    const { data: task } = await supabase
      .from(TASKS_TABLE)
      .select('id,title,assigned_user,created_by')
      .eq('id', taskId)
      .single();

    const recipients = new Set(
      [task?.assigned_user, task?.created_by]
        .filter(Boolean)
        .filter((userId) => String(userId) !== String(actor?.id || ''))
    );

    await Promise.all([...recipients].map((userId) => createTaskNotification({
      task_id: taskId,
      user_id: userId,
      title: 'New comment on your task',
      message: `${task?.title || 'Task'}\n→ "${message}"`,
    })));
  } catch (notificationError) {
    console.warn('Task comment notification skipped:', notificationError.message || notificationError);
  }

  return data;
};

export const updateTaskComment = async (commentId, comment) => {
  const message = String(comment || '').trim();
  if (!commentId || !message) return null;

  const { data, error } = await supabase
    .from(COMMENTS_TABLE)
    .update({ comment: message })
    .eq('id', commentId)
    .select('*');

  if (error) throw error;
  return data?.[0] || null;
};

export const deleteTaskComment = async (commentId) => {
  if (!commentId) return false;

  const { error } = await supabase
    .from(COMMENTS_TABLE)
    .delete()
    .eq('id', commentId);

  if (error) throw error;
  return true;
};

export const createTaskNotification = async (notification) => {
  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .insert({
      task_id: notification.task_id,
      user_id: notification.user_id,
      title: notification.title,
      message: notification.message,
    })
    .select('*')
    .single();

  if (error) {
    console.warn('Task notification skipped:', error.message || error);
    return null;
  }
  return data;
};

export const getTaskNotifications = async (userId) => {
  if (!userId) return [];

  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.warn('Task notifications unavailable:', error.message || error);
    return [];
  }
  return data || [];
};

export const getTaskStats = async (userId) => {
  const tasks = await getTasks();
  const activeTasks = tasks.filter((task) => task.status !== 'done');
  const myTasks = userId
    ? activeTasks.filter((task) => String(task.assigned_user || '') === String(userId))
    : [];
  const readMap = getTaskCommentReadMap(userId);
  const unreadCommentTasks = userId
    ? activeTasks.filter((task) => {
      const relevantToUser = String(task.assigned_user || '') === String(userId)
        || String(task.created_by || '') === String(userId);
      return relevantToUser && hasUnreadTaskComments(task, userId, readMap);
    })
    : [];

  return {
    total: tasks.length,
    active: activeTasks.length,
    my: myTasks.length,
    open: activeTasks.filter((task) => !task.assigned_user).length,
    done: tasks.filter((task) => task.status === 'done').length,
    unreadComments: unreadCommentTasks.reduce((count, task) => count + Number(task.comment_count || 0), 0),
    attention: unreadCommentTasks.length,
  };
};

export default {
  getTasks,
  createTask,
  claimTask,
  unclaimTask,
  markTaskDone,
  updateTask,
  deleteTask,
  getTaskComments,
  addTaskComment,
  updateTaskComment,
  deleteTaskComment,
  getTaskNotifications,
  getTaskStats,
};
