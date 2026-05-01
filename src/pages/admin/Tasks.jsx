import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Circle, Clock3, MessageSquare, MoreHorizontal, Pencil, Plus, Share2, Trash2, Trophy, UserMinus, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { TABLE_NAMES } from '../../config/tableNames';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase.js';
import { getUsers } from '../../services/UserService';
import { shortenUrl } from '../../services/UrlShortenerService';
import {
  addTaskComment,
  claimTask,
  createTask,
  deleteTask,
  deleteTaskComment,
  getTaskComments,
  getTaskNotifications,
  getTasks,
  markTaskDone,
  unclaimTask,
  updateTask,
  updateTaskComment,
} from '../../services/TaskService';
import i18n from '../../i18n';

const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);

const TASK_LABEL_PREVIEW_LIMIT = 5;
const MAX_LABEL_SELECTOR_OPTIONS = 60;
const CUSTOM_TASK_LABELS_STORAGE_KEY = 'saharax-task-custom-labels';

const infoLabelOptions = [
  { type: 'info', key: 'mechanic', emoji: '🔧', text: 'Mechanic' },
  { type: 'info', key: 'purchase', emoji: '🛒', text: 'Purchase' },
  { type: 'info', key: 'oil_change', emoji: '🛢', text: 'Oil Change' },
  { type: 'info', key: 'documents', emoji: '📑', text: 'Documents' },
  { type: 'info', key: 'urgent', emoji: '⚠️', text: 'Urgent' },
];

const priorityOptions = [
  { key: 'normal', label: 'Normal', dotClass: 'bg-slate-300', selectedClass: 'border-slate-300 bg-slate-100 text-slate-800' },
  { key: 'medium', label: 'Medium', dotClass: 'bg-violet-400', selectedClass: 'border-violet-300 bg-violet-50 text-violet-800' },
  { key: 'urgent', label: 'Urgent', dotClass: 'bg-red-500', selectedClass: 'border-red-300 bg-red-50 text-red-700' },
];

const labelSlug = (text = '') => String(text || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-|-$/g, '');

const actorName = (profile) => (
  profile?.full_name || profile?.fullName || profile?.name || profile?.email || 'Team Member'
);

const userName = (user) => (
  [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
  || user?.full_name
  || user?.fullName
  || user?.name
  || user?.user_metadata?.full_name
  || user?.email
  || 'Team Member'
);

const userId = (user) => (
  user?.id || user?.user_id || user?.auth_user_id || user?.authUserId || ''
);

const isLegacyPlaceholderName = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'system owner' || normalized === 'no name';
};

const mergeCurrentUserProfile = (user, userProfile) => {
  if (!user) return user;
  const candidateId = String(userId(user) || '');
  const currentId = String(userProfile?.id || '');
  if (!candidateId || !currentId || candidateId !== currentId) return user;

  const mergedFullName =
    [userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ').trim()
    || userProfile?.full_name
    || userProfile?.fullName
    || [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
    || user?.full_name
    || user?.fullName
    || user?.name
    || user?.email
    || '';

  return {
    ...user,
    first_name: userProfile?.first_name || user?.first_name || '',
    last_name: userProfile?.last_name || user?.last_name || '',
    full_name: mergedFullName,
    fullName: mergedFullName,
    name: mergedFullName,
    email: userProfile?.email || user?.email || '',
  };
};

const truncateComment = (text = '', maxLength = 72) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
};

const getTaskReference = (task) => {
  const source = String(task?.task_ref || task?.reference || task?.id || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return source ? `TASK-${source.slice(0, 6)}` : 'TASK-NEW';
};

const buildEntityLink = (task) => {
  if (!task?.linked_entity_type || !task?.linked_entity_id) return null;
  const type = String(task.linked_entity_type).toLowerCase();
  if (type === 'vehicle') return `/admin/fleet/${task.linked_entity_id}`;
  if (type === 'rental') return `/admin/rentals/${task.linked_entity_id}`;
  if (type === 'maintenance') return `/admin/maintenance?maintenanceId=${task.linked_entity_id}`;
  if (type === 'tour') return '/admin/tours';
  return null;
};

const buildLabelHref = (label) => {
  if (label?.href) return label.href;
  const type = String(label?.entityType || '').toLowerCase();
  const entityId = label?.entityId;
  if (!type || !entityId) return null;
  if (type === 'vehicle') return `/admin/fleet/${entityId}`;
  if (type === 'rental') return `/admin/rentals/${entityId}`;
  if (type === 'maintenance') return `/admin/maintenance?maintenanceId=${entityId}`;
  if (type === 'tour') return '/admin/tours';
  return null;
};

const linkedEntityConfig = {
  vehicle: { emoji: '🚗', text: 'Vehicle' },
  rental: { emoji: '📄', text: 'Rental' },
  maintenance: { emoji: '🔧', text: 'Maintenance' },
  tour: { emoji: '🏍️', text: 'Tour' },
};

const getTourMeta = (row) => {
  const raw = row?.booking_payload || row?.notes || '';
  const marker = '[tour_booking]';
  const source = typeof raw === 'string' && raw.includes(marker) ? raw.split(marker).pop() : raw;
  try {
    return typeof source === 'string' ? JSON.parse(source) : source || {};
  } catch {
    return {};
  }
};

const formatTourDateTime = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeTaskLabels = (task) => {
  const labels = Array.isArray(task?.labels)
    ? task.labels
      .filter(Boolean)
      .map((label) => ({
        ...label,
        locked: Boolean(label.locked || label.system),
        href: buildLabelHref(label),
      }))
    : [];
  const hasLinkedLabel = labels.some((label) => label?.entityType && label?.entityId);
  const urgentFallback = task?.priority === 'urgent' && !labels.some((label) => label?.key === 'urgent')
    ? [infoLabelOptions.find((label) => label.key === 'urgent')]
    : [];

  if (hasLinkedLabel || !task?.linked_entity_type || !task?.linked_entity_id) {
    return [...labels, ...urgentFallback].filter(Boolean);
  }

  const type = String(task.linked_entity_type).toLowerCase();
  const config = linkedEntityConfig[type];
  const href = buildEntityLink(task);
  const legacyLabel = config && href
    ? {
      type: 'linked',
      key: `${type}:${task.linked_entity_id}`,
      emoji: config.emoji,
      text: `${config.text} ${task.linked_entity_id}`,
      entityType: type,
      entityId: String(task.linked_entity_id),
      href,
    }
    : null;

  return [legacyLabel, ...labels, ...urgentFallback].filter(Boolean);
};

const sortTaskLabels = (labels = []) => [...labels].sort((a, b) => {
  const aLinked = a?.entityType ? 0 : 1;
  const bLinked = b?.entityType ? 0 : 1;
  return aLinked - bLinked;
});

const isUrgentTask = (task) => (
  task?.priority === 'urgent'
  || normalizeTaskLabels(task).some((label) => label?.key === 'urgent' || /urgent/i.test(label?.text || ''))
);

const getTaskPriority = (task) => {
  const priority = String(task?.priority || 'normal').toLowerCase();
  return priorityOptions.find((option) => option.key === priority) || priorityOptions[0];
};

const TaskLabel = ({ label, removable, onRemove }) => {
  if (!label) return null;
  const canRemove = removable && !label.locked;
  const isDone = label.status === 'done';
  const content = (
    <>
      <span>{label.emoji}</span>
      <span>{label.text}</span>
      {isDone && <span className="ml-1 text-emerald-600">✓</span>}
      {label.locked && removable && <span className="ml-1 text-[10px] font-black text-violet-400">SYSTEM</span>}
      {canRemove && <span className="ml-1 text-slate-400">×</span>}
    </>
  );
  const className = `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${label.entityType ? (isDone ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100') : 'border-slate-200 bg-slate-50 text-slate-700'}`;

  if (label.href && !removable) {
    return <Link to={label.href} className={className}>{content}</Link>;
  }

  if (canRemove) {
    return (
      <button type="button" onClick={onRemove} className={className}>
        {content}
      </button>
    );
  }

  return <span className={className}>{content}</span>;
};

const PersonBadge = ({ label, name, important = false, empty = false }) => (
  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${
    important
      ? 'border-violet-200 bg-violet-50 text-violet-900 shadow-sm shadow-violet-100/70'
      : empty
        ? 'border-slate-200 bg-slate-50 text-slate-600'
        : 'border-slate-200 bg-white text-slate-700'
  }`}>
    <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${important ? 'text-violet-600' : 'text-slate-400'}`}>{label}</span>
    <span className={`text-xs font-bold ${important ? 'text-violet-950' : ''}`}>{name}</span>
  </span>
);

const AssigneeChip = ({ name, important = false, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition ${
      important
        ? 'border-violet-300 bg-violet-100 text-violet-950 shadow-sm shadow-violet-100/80 hover:bg-violet-200'
        : 'border-sky-200 bg-sky-50 text-sky-900 shadow-sm shadow-sky-100/80 hover:border-sky-300 hover:bg-sky-100'
    }`}
  >
    <span className={`text-[10px] uppercase tracking-[0.12em] ${important ? 'text-violet-700' : 'text-sky-600'}`}>{tr('Assigned', 'Assigne')}</span>
    <span className="font-black">{name}</span>
  </button>
);

const safeLoadLabelSource = async (label, query) => {
  try {
    const { data, error } = await query;
    if (error) {
      console.warn(`${label} labels unavailable:`, error.message || error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn(`${label} labels unavailable:`, error.message || error);
    return [];
  }
};

const loadLabelSources = async () => {
  const [vehicles, rentals, maintenance, tours] = await Promise.all([
    safeLoadLabelSource('Vehicle', supabase
      .from('saharax_0u4w4d_vehicles')
      .select('id,plate_number,name,model')
      .order('plate_number', { ascending: true })
      .limit(120)),
    safeLoadLabelSource('Rental', supabase
      .from('app_4c3a7a6153_rentals')
      .select('id,rental_id,customer_name,created_at')
      .order('created_at', { ascending: false })
      .limit(120)),
    safeLoadLabelSource('Maintenance', supabase
      .from('app_687f658e98_maintenance')
      .select('id,vehicle_id,created_at')
      .order('created_at', { ascending: false })
      .limit(120)),
    safeLoadLabelSource('Tours', supabase
      .from(TABLE_NAMES.TOUR_BOOKINGS)
      .select('id,tour_id,customer_name,booking_payload,booking_status,scheduled_for,rental_status,package_name,route_type,guide_id,guide_name,scheduled_date,scheduled_time,scheduled_end_at,notes,quad_count')
      .order('scheduled_for', { ascending: true })
      .limit(120)),
  ]);

  return {
    vehicles,
    rentals,
    maintenance,
    tours,
  };
};

const TaskCard = ({
  task,
  currentUser,
  onClaim,
  onDone,
  onEdit,
  onDelete,
  onShare,
  onUnclaim,
  onOpenComments,
  onFilterAssignee,
  onToggleLabelDone,
  highlighted,
  commentCount = 0,
  hasUnreadComments = false,
  lastComment = null,
  assigneeName = '',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [labelsExpanded, setLabelsExpanded] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const moreMenuRef = useRef(null);
  const assignedToMe = String(task.assigned_user || '') === String(currentUser?.id || '');
  const assigneeDisplayName = assignedToMe
    ? tr('You', 'Vous')
    : task.assigned_user
      ? (assigneeName || task.assigned_user_name || tr('Assigned user', 'Utilisateur assigne'))
      : '';
  const canComplete = task.status !== 'done' && assignedToMe;
  const labels = sortTaskLabels(normalizeTaskLabels(task));
  const checklistLabels = labels.filter((label) => ['vehicle', 'maintenance', 'rental'].includes(String(label?.entityType || '').toLowerCase()));
  const visibleLabels = labelsExpanded ? labels : labels.slice(0, TASK_LABEL_PREVIEW_LIMIT);
  const hiddenLabelCount = Math.max(0, labels.length - visibleLabels.length);
  const urgent = isUrgentTask(task);
  const priority = getTaskPriority(task);
  const visibleStatus = task.status === 'done'
    ? tr('Done', 'Termine')
    : !task.assigned_user
      ? tr('Open', 'Ouverte')
      : '';

  useEffect(() => {
    if (!showMore) return undefined;

    const handleOutsideClick = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMore(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showMore]);

  const cardAttentionClass = hasUnreadComments
    ? 'border-emerald-200 bg-emerald-50/25 shadow-sm shadow-emerald-100/60'
    : highlighted || assignedToMe
      ? 'border-violet-200 bg-white shadow-sm shadow-violet-100/70'
      : 'border-slate-300/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]';

  return (
    <div className={`relative overflow-visible rounded-3xl border p-4 transition ${cardAttentionClass}`}>
      {(highlighted || assignedToMe || hasUnreadComments) && (
        <span className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${hasUnreadComments ? 'bg-emerald-300' : 'bg-violet-300'}`} />
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
              {getTaskReference(task)}
            </span>
            <h3 className="text-base font-bold text-slate-950">{task.title}</h3>
            {urgent && task.status !== 'done' && (
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">
                {tr('Urgent', 'Urgent')}
              </span>
            )}
            {priority.key === 'medium' && task.status !== 'done' && !urgent && (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                {tr('Medium', 'Moyen')}
              </span>
            )}
            {visibleStatus && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {visibleStatus}
              </span>
            )}
          </div>
          {visibleLabels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleLabels.map((label) => <TaskLabel key={label.key || `${label.text}-${label.entityId || ''}`} label={label} />)}
              {hiddenLabelCount > 0 && (
                <button
                  type="button"
                  onClick={() => setLabelsExpanded(true)}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
                >
                  +{hiddenLabelCount}
                </button>
              )}
              {labelsExpanded && labels.length > TASK_LABEL_PREVIEW_LIMIT && (
                <button
                  type="button"
                  onClick={() => setLabelsExpanded(false)}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
                >
                  {tr('Show less', 'Voir moins')}
                </button>
              )}
            </div>
          )}
          {checklistLabels.length > 0 && labelsExpanded && (
            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
              <p className="px-1 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                {tr('Linked checklist', 'Liste liee')}
              </p>
              <div className="space-y-1">
                {checklistLabels.map((label) => {
                  const done = label.status === 'done';
                  const canToggle = task.status !== 'done' && assignedToMe;
                  return (
                    <div key={label.key} className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2">
                      {label.href ? (
                        <Link to={label.href} className={`min-w-0 truncate text-sm font-bold ${done ? 'text-emerald-700 line-through decoration-emerald-300' : 'text-slate-800 hover:text-violet-700'}`}>
                          {label.emoji} {label.text}
                        </Link>
                      ) : (
                        <span className={`min-w-0 truncate text-sm font-bold ${done ? 'text-emerald-700 line-through decoration-emerald-300' : 'text-slate-800'}`}>
                          {label.emoji} {label.text}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={!canToggle}
                        onClick={() => onToggleLabelDone?.(task, label)}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-black transition ${
                          done
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-700'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {done ? tr('Done', 'Termine') : tr('Mark done', 'Terminer')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {lastComment?.comment && (
            <p className={`mt-2 line-clamp-1 text-sm ${hasUnreadComments ? 'font-black text-violet-800' : 'font-semibold text-slate-500'}`}>
              💬 “{truncateComment(lastComment.comment)}” — {lastComment.created_by_name || 'Team'}
            </p>
          )}
          {task.description && (
            <div className="mt-2">
              <p className={`${expanded ? '' : 'line-clamp-1'} text-sm text-slate-600`}>{task.description}</p>
              <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-xs font-bold text-violet-700 hover:text-violet-900">
                {expanded ? tr('Hide details', 'Masquer') : tr('Details', 'Details')}
              </button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {task.assigned_user ? (
              <AssigneeChip
                name={assigneeDisplayName}
                important={assignedToMe}
                onClick={() => onFilterAssignee?.(task.assigned_user, assigneeDisplayName)}
              />
            ) : (
              <PersonBadge
                label={tr('Open task', 'Tache ouverte')}
                name={tr('Open to claim', 'Ouvert')}
                empty
              />
            )}
            <PersonBadge
              label={tr('By', 'Par')}
              name={task.created_by_name || 'Team'}
            />
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
          {!task.assigned_user && task.status !== 'done' && (
            <Button size="sm" onClick={() => onClaim(task)} className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700">
              <UserPlus className="mr-1.5 h-4 w-4" />
              {tr('Claim', 'Prendre')}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenComments(task)}
            className={`relative rounded-2xl ${
              hasUnreadComments
                ? 'border-violet-300 bg-violet-50 text-violet-800 shadow-sm shadow-violet-100 hover:bg-violet-100'
                : commentCount > 0
                  ? 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
                  : ''
            }`}
          >
            {commentCount > 0 && (
              <span className={`absolute -right-1 -top-1 h-3 w-3 rounded-full ${hasUnreadComments ? 'animate-ping bg-emerald-400' : 'bg-emerald-300 opacity-80'}`} />
            )}
            <MessageSquare className="mr-1.5 h-4 w-4" />
            {commentCount}
            {hasUnreadComments && <span className="ml-1.5 h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />}
          </Button>
          {canComplete && (
            <Button size="sm" onClick={() => onDone(task)} className="rounded-2xl bg-green-600 text-white hover:bg-green-700">
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {tr('Done', 'Termine')}
            </Button>
          )}
          <div ref={moreMenuRef} className="relative ml-auto sm:ml-0">
            <Button size="sm" variant="outline" onClick={() => setShowMore((value) => !value)} className="rounded-2xl">
              <MoreHorizontal className="mr-1.5 h-4 w-4" />
              {tr('More', 'Plus')}
            </Button>
            {showMore && (
              <div className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setShowMore(false);
                    onEdit(task);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="h-4 w-4" />
                  {tr('Edit', 'Modifier')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMore(false);
                    onShare(task);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Share2 className="h-4 w-4" />
                  {tr('Share', 'Partager')}
                </button>
                {assignedToMe && task.status !== 'done' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMore(false);
                      onUnclaim(task);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <UserMinus className="h-4 w-4" />
                    {tr('Unclaim', 'Liberer')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowMore(false);
                    onDelete(task);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {tr('Remove', 'Supprimer')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Tasks = () => {
  const { userProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeView, setActiveView] = useState('my');
  const [tasks, setTasks] = useState([]);
  const [focusMode, setFocusMode] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState(null);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentTask, setCommentTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [commentReadAt, setCommentReadAt] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [labelSources, setLabelSources] = useState({ vehicles: [], rentals: [], maintenance: [], tours: [] });
  const [showLabelTools, setShowLabelTools] = useState(false);
  const [activeLabelSelector, setActiveLabelSelector] = useState(null);
  const [labelSearch, setLabelSearch] = useState('');
  const [customInfoLabels, setCustomInfoLabels] = useState([]);
  const [customLabelEmoji, setCustomLabelEmoji] = useState('');
  const [customLabelText, setCustomLabelText] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigned_user: '',
    priority: 'normal',
    labels: [],
  });

  const highlightedTaskId = searchParams.get('task');
  const commentReadStorageKey = userProfile?.id ? `task-comments-read:${userProfile.id}` : '';

  useEffect(() => {
    if (!commentReadStorageKey) {
      setCommentReadAt({});
      return;
    }
    try {
      setCommentReadAt(JSON.parse(window.localStorage.getItem(commentReadStorageKey) || '{}'));
    } catch {
      setCommentReadAt({});
    }
  }, [commentReadStorageKey]);

  const getTaskLastComment = (task) => (
    task?.last_comment || (Array.isArray(task?.comments) ? task.comments[task.comments.length - 1] : null)
  );

  const getTaskCommentCount = (task) => Number(
    task?.comment_count || (Array.isArray(task?.comments) ? task.comments.length : 0)
  );

  const taskHasUnreadComments = (task) => {
    const lastComment = getTaskLastComment(task);
    if (!lastComment?.created_at || !userProfile?.id || task.status === 'done') return false;
    if (String(lastComment.created_by || '') === String(userProfile.id)) return false;
    const readAt = commentReadAt[task.id];
    return !readAt || new Date(lastComment.created_at).getTime() > new Date(readAt).getTime();
  };

  const markTaskCommentsRead = (task, rows = []) => {
    if (!task?.id || !commentReadStorageKey) return;
    const lastComment = rows[rows.length - 1] || getTaskLastComment(task);
    const readAt = lastComment?.created_at || new Date().toISOString();
    setCommentReadAt((prev) => {
      const next = { ...prev, [task.id]: readAt };
      try {
        window.localStorage.setItem(commentReadStorageKey, JSON.stringify(next));
        window.dispatchEvent(new Event('task-comments-read'));
      } catch {
        // Ignore storage failures; comments still work.
      }
      return next;
    });
  };

  const resetTaskForm = () => {
    setForm({ title: '', description: '', assigned_user: '', priority: 'normal', labels: [] });
    setEditingTask(null);
    setShowLabelTools(false);
    setActiveLabelSelector(null);
    setLabelSearch('');
    setCustomLabelEmoji('');
    setCustomLabelText('');
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [taskRows, userRows, notificationRows] = await Promise.all([
        getTasks(),
        getUsers().catch(() => []),
        getTaskNotifications(userProfile?.id).catch(() => []),
      ]);
      setTasks(taskRows);
      setUsers(userRows || []);
      setNotifications(notificationRows || []);
      setLabelSources(await loadLabelSources());
    } catch (err) {
      console.error('Unable to load tasks:', err);
      setError(err.message || tr('Unable to load tasks', 'Impossible de charger les taches'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userProfile?.id]);

  useEffect(() => {
    try {
      const savedLabels = JSON.parse(window.localStorage.getItem(CUSTOM_TASK_LABELS_STORAGE_KEY) || '[]');
      setCustomInfoLabels(Array.isArray(savedLabels) ? savedLabels.filter((label) => label?.key && label?.text) : []);
    } catch {
      setCustomInfoLabels([]);
    }
  }, []);

  const filteredTasks = useMemo(() => {
    const userId = String(userProfile?.id || '');
    if (assigneeFilter?.id) {
      return tasks.filter((task) => (
        task.status !== 'done'
        && String(task.assigned_user || '') === String(assigneeFilter.id)
      ));
    }
    if (focusMode) {
      return tasks
        .filter((task) => (
          task.status !== 'done'
          && (String(task.assigned_user || '') === userId || isUrgentTask(task))
        ))
        .sort((a, b) => {
          const aMine = String(a.assigned_user || '') === userId ? 0 : 1;
          const bMine = String(b.assigned_user || '') === userId ? 0 : 1;
          if (aMine !== bMine) return aMine - bMine;
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });
    }
    const scopedTasks = tasks;
    if (activeView === 'my') {
      return scopedTasks.filter((task) => task.status !== 'done' && String(task.assigned_user || '') === userId);
    }
    if (activeView === 'open') {
      return scopedTasks.filter((task) => task.status !== 'done' && !task.assigned_user);
    }
    if (activeView === 'urgent') {
      return scopedTasks.filter((task) => task.status !== 'done' && isUrgentTask(task));
    }
    if (activeView === 'completed') {
      return scopedTasks.filter((task) => task.status === 'done');
    }
    return scopedTasks.filter((task) => task.status !== 'done');
  }, [activeView, assigneeFilter, focusMode, tasks, userProfile?.id]);

  const leaderboard = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const counts = new Map();
    tasks
      .filter((task) => task.status === 'done' && String(task.completed_at || '').startsWith(monthKey))
      .forEach((task) => {
        const key = task.completed_by || task.assigned_user || 'unknown';
        const name = task.completed_by_name || task.assigned_user_name || 'Team Member';
        const current = counts.get(key) || { id: key, name, count: 0 };
        counts.set(key, { ...current, count: current.count + 1 });
      });
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  }, [tasks]);

  const stats = useMemo(() => ({
    my: tasks.filter((task) => task.status !== 'done' && String(task.assigned_user || '') === String(userProfile?.id || '')).length,
    open: tasks.filter((task) => task.status !== 'done' && !task.assigned_user).length,
    urgent: tasks.filter((task) => task.status !== 'done' && isUrgentTask(task)).length,
    team: tasks.filter((task) => task.status !== 'done').length,
    completed: tasks.filter((task) => task.status === 'done').length,
    completedToday: tasks.filter((task) => {
      if (task.status !== 'done' || !task.completed_at) return false;
      return new Date(task.completed_at).toDateString() === new Date().toDateString();
    }).length,
  }), [tasks, userProfile?.id]);

  const todayLeader = useMemo(() => {
    const today = new Date().toDateString();
    const counts = new Map();
    tasks
      .filter((task) => task.status === 'done' && task.completed_at && new Date(task.completed_at).toDateString() === today)
      .forEach((task) => {
        const key = task.completed_by || task.assigned_user || 'unknown';
        const name = task.completed_by_name || task.assigned_user_name || 'Team Member';
        const current = counts.get(key) || { id: key, name, count: 0 };
        counts.set(key, { ...current, count: current.count + 1 });
      });
    return [...counts.values()].sort((a, b) => b.count - a.count)[0] || null;
  }, [tasks]);

  const reusableInfoLabels = useMemo(() => {
    const labelMap = new Map();
    const addReusable = (label) => {
      if (!label?.text || label?.entityType) return;
      const key = label.key || `custom:${labelSlug(label.text)}`;
      if (!key || labelMap.has(key)) return;
      labelMap.set(key, {
        type: 'info',
        key,
        emoji: label.emoji || '🏷️',
        text: label.text,
      });
    };

    infoLabelOptions.forEach(addReusable);
    customInfoLabels.forEach(addReusable);
    tasks.forEach((task) => {
      normalizeTaskLabels(task).forEach(addReusable);
    });

    return [...labelMap.values()];
  }, [customInfoLabels, tasks]);

  const saveReusableLabel = (label) => {
    if (!label?.key || label?.entityType) return;
    setCustomInfoLabels((prev) => {
      const nextMap = new Map(prev.map((item) => [item.key, item]));
      nextMap.set(label.key, {
        type: 'info',
        key: label.key,
        emoji: label.emoji || '🏷️',
        text: label.text,
      });
      const next = [...nextMap.values()];
      try {
        window.localStorage.setItem(CUSTOM_TASK_LABELS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Reusable labels still work for this session.
      }
      return next;
    });
  };

  const selectedLabelKeys = useMemo(() => new Set((form.labels || []).map((label) => label.key)), [form.labels]);
  const effectiveUsers = useMemo(() => {
    const merged = new Map();
    users.forEach((user) => {
      const id = String(userId(user) || '');
      if (!id) return;
      merged.set(id, mergeCurrentUserProfile(user, userProfile));
    });

    const currentId = String(userProfile?.id || '');
    if (currentId && !merged.has(currentId)) {
      merged.set(currentId, mergeCurrentUserProfile({
        id: userProfile.id,
        email: userProfile.email || '',
        full_name: userProfile.full_name || userProfile.fullName || '',
        first_name: userProfile.first_name || '',
        last_name: userProfile.last_name || '',
      }, userProfile));
    }

    const values = [...merged.values()];
    const currentDisplayName = String(
      [userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ').trim()
      || userProfile?.full_name
      || userProfile?.fullName
      || userProfile?.email
      || ''
    ).trim();

    if (!currentDisplayName || isLegacyPlaceholderName(currentDisplayName)) {
      return values;
    }

    return values.filter((user) => {
      const id = String(userId(user) || '');
      if (id && id === currentId) return true;
      return !isLegacyPlaceholderName(userName(user));
    });
  }, [userProfile, users]);
  const usersById = useMemo(() => {
    const map = new Map();
    effectiveUsers.forEach((user) => {
      const id = userId(user);
      if (id) map.set(String(id), user);
    });
    return map;
  }, [effectiveUsers]);
  const activeAssignees = useMemo(() => {
    const assignees = new Map();
    tasks
      .filter((task) => task.status !== 'done' && task.assigned_user)
      .forEach((task) => {
        const id = String(task.assigned_user || '');
        if (!id) return;
        const existing = assignees.get(id) || {
          id,
          name: String(id) === String(userProfile?.id || '')
            ? tr('You', 'Vous')
            : (userName(usersById.get(id)) || task.assigned_user_name || tr('Assigned user', 'Utilisateur assigne')),
          count: 0,
        };
        assignees.set(id, { ...existing, count: existing.count + 1 });
      });
    return [...assignees.values()].sort((a, b) => {
      const aMine = String(a.id) === String(userProfile?.id || '') ? 0 : 1;
      const bMine = String(b.id) === String(userProfile?.id || '') ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      return b.count - a.count;
    });
  }, [tasks, userProfile?.id, usersById]);
  const selectedAssignedUser = usersById.get(String(form.assigned_user || '')) || null;

  const findGuideUser = (guideId, guideName) => {
    if (guideId && usersById.has(String(guideId))) return usersById.get(String(guideId));
    const normalizedGuideName = String(guideName || '').trim().toLowerCase();
    if (!normalizedGuideName) return null;
    return effectiveUsers.find((user) => userName(user).trim().toLowerCase() === normalizedGuideName) || null;
  };

  const addLabel = (label) => {
    if (!label || selectedLabelKeys.has(label.key)) return;
    setForm((prev) => ({ ...prev, labels: [...(prev.labels || []), label] }));
  };

  const addSelectorLabel = (label) => {
    if (!label || selectedLabelKeys.has(label.key)) return;

    if (label.entityType !== 'tour') {
      addLabel(label);
      return;
    }

    const guide = findGuideUser(label.guideId, label.guideName);
    const assignmentText = [
      `Tour assignment: ${label.tourName || label.text}`,
      `Departure: ${label.scheduledText || 'Not scheduled'}`,
      `Guide: ${label.guideName || (guide ? userName(guide) : 'Unassigned')}`,
    ].join('\n');

    setForm((prev) => {
      const existingDescription = String(prev.description || '').trim();
      return {
        ...prev,
        assigned_user: guide ? String(userId(guide)) : prev.assigned_user,
        description: existingDescription.includes(label.key)
          ? prev.description
          : [existingDescription, assignmentText].filter(Boolean).join('\n\n'),
        labels: [...(prev.labels || []), label],
      };
    });
  };

  const removeLabel = (labelKey) => {
    setForm((prev) => ({ ...prev, labels: (prev.labels || []).filter((label) => label.key !== labelKey) }));
  };

  const addCustomLabel = () => {
    const text = customLabelText.trim();
    if (!text) return;
    const emoji = customLabelEmoji.trim() || '🏷️';
    const label = {
      type: 'info',
      key: `custom:${labelSlug(text) || Date.now()}`,
      emoji,
      text,
    };
    saveReusableLabel(label);
    addLabel(label);
    setCustomLabelEmoji('');
    setCustomLabelText('');
  };

  const selectorOptions = useMemo(() => {
    const search = labelSearch.trim().toLowerCase();
    if (activeLabelSelector === 'vehicle') {
      return labelSources.vehicles
        .map((vehicle) => {
          const plate = vehicle.plate_number || vehicle.name || vehicle.id;
          const model = vehicle.model || '';
          return {
            key: `vehicle:${vehicle.id}`,
            emoji: '🚗',
            text: `${plate}${model ? ` • ${model}` : ''}`,
            entityType: 'vehicle',
            entityId: String(vehicle.id),
            href: `/admin/fleet/${vehicle.id}`,
            searchable: `${plate} ${model} ${vehicle.name || ''} ${vehicle.id}`.toLowerCase(),
          };
        })
        .filter((label) => !search || label.searchable.includes(search))
        .slice(0, MAX_LABEL_SELECTOR_OPTIONS);
    }
    if (activeLabelSelector === 'rental') {
      return labelSources.rentals
        .map((rental) => {
          const ref = rental.rental_id || rental.id;
          const customer = rental.customer_name || '';
          return {
            key: `rental:${rental.id}`,
            emoji: '📄',
            text: `${ref}${customer ? ` • ${customer}` : ''}`,
            entityType: 'rental',
            entityId: String(rental.id),
            href: `/admin/rentals/${rental.id}`,
            searchable: `${ref} ${customer}`.toLowerCase(),
          };
        })
        .filter((label) => !search || label.searchable.includes(search))
        .slice(0, MAX_LABEL_SELECTOR_OPTIONS);
    }
    if (activeLabelSelector === 'maintenance') {
      return labelSources.maintenance
        .map((record) => {
          const shortId = String(record.id || '').slice(0, 8).toUpperCase();
          const vehicleText = record.vehicle_id ? ` • Vehicle ${record.vehicle_id}` : '';
          return {
            key: `maintenance:${record.id}`,
            emoji: '🔧',
            text: `MNT-${shortId}${vehicleText}`,
            entityType: 'maintenance',
            entityId: String(record.id),
            href: `/admin/maintenance?maintenanceId=${record.id}`,
            searchable: `${record.id} ${record.vehicle_id || ''}`.toLowerCase(),
          };
        })
        .filter((label) => !search || label.searchable.includes(search))
        .slice(0, MAX_LABEL_SELECTOR_OPTIONS);
    }
    if (activeLabelSelector === 'tour') {
      const now = Date.now();
      return labelSources.tours
        .map((tour) => {
          const meta = getTourMeta(tour);
          const status = String(tour.rental_status || tour.booking_status || tour.status || 'scheduled').toLowerCase();
          const scheduledAt = tour.scheduled_for || meta.scheduledStartAt || tour.scheduled_date || tour.created_at;
          const scheduledTime = new Date(scheduledAt || '').getTime();
          const groupId = meta.groupId || tour.tour_id || `Tour ${tour.id}`;
          const tourName = tour.package_name || meta.packageName || groupId;
          const guideId = tour.guide_id || meta.guideId || '';
          const guideName = tour.guide_name || meta.guideName || '';
          const scheduledText = formatTourDateTime(scheduledAt);
          return {
            key: `tour:${groupId || tour.id}`,
            emoji: '🏍️',
            text: `${groupId} • ${tourName}`,
            entityType: 'tour',
            entityId: String(groupId || tour.id),
            href: '/admin/tours',
            locked: true,
            system: true,
            guideId: guideId ? String(guideId) : '',
            guideName,
            scheduledAt,
            scheduledText,
            tourName,
            status,
            searchable: `${groupId} ${tourName} ${guideName} ${tour.customer_name || ''} ${scheduledText}`.toLowerCase(),
            sortTime: Number.isNaN(scheduledTime) ? Number.MAX_SAFE_INTEGER : scheduledTime,
          };
        })
        .filter((label) => ['scheduled', 'confirmed', 'pending'].includes(label.status))
        .filter((label) => !label.sortTime || label.sortTime >= now - 24 * 60 * 60 * 1000)
        .filter((label) => !search || label.searchable.includes(search))
        .sort((a, b) => a.sortTime - b.sortTime)
        .slice(0, MAX_LABEL_SELECTOR_OPTIONS);
    }
    return [];
  }, [activeLabelSelector, labelSearch, labelSources]);

  const handleCreateTask = async (event) => {
    event.preventDefault();
    const assignedUser = usersById.get(String(form.assigned_user || ''));
    const payload = {
      assigned_user: form.assigned_user || null,
      assigned_user_name: assignedUser ? userName(assignedUser) : null,
      created_by: userProfile?.id || null,
      created_by_name: actorName(userProfile),
      description: form.description,
      labels: form.labels,
      priority: form.priority || 'normal',
      title: form.title,
    };

    if (editingTask?.id) {
      await updateTask(editingTask.id, payload);
    } else {
      await createTask(payload);
    }

    resetTaskForm();
    setShowCreate(false);
    await loadData();
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setForm({
      title: task.title || '',
      description: task.description || '',
      assigned_user: task.assigned_user || '',
      priority: task.priority || 'normal',
      labels: normalizeTaskLabels(task),
    });
    setShowCreate(true);
    setShowLabelTools(false);
    setActiveLabelSelector(null);
    setLabelSearch('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteTask = async (task) => {
    if (!task?.id) return;
    const confirmed = window.confirm(tr(`Remove task "${task.title}"?`, `Supprimer la tâche "${task.title}" ?`));
    if (!confirmed) return;
    await deleteTask(task.id);
    await loadData();
  };

  const handleToggleLinkedLabelDone = async (task, label) => {
    if (!task?.id || !label?.key) return;
    const currentLabels = normalizeTaskLabels(task);
    const nextLabels = currentLabels.map((item) => {
      if (item.key !== label.key) return item;
      const isDone = item.status === 'done';
      return {
        ...item,
        status: isDone ? 'pending' : 'done',
        completedAt: isDone ? null : new Date().toISOString(),
        completedBy: isDone ? null : userProfile?.id || null,
        completedByName: isDone ? null : actorName(userProfile),
      };
    });

    await updateTask(task.id, { labels: nextLabels });
    await loadData();
  };

  const handleOpenComments = async (task) => {
    const rows = await getTaskComments(task.id);
    const lastComment = rows[rows.length - 1] || null;
    setEditingCommentId(null);
    setEditingCommentText('');
    setCommentTask({
      ...task,
      comments: rows,
      comment_count: rows.length,
      last_comment: lastComment,
    });
    setComments(rows);
    markTaskCommentsRead(task, rows);
  };

  const handleAddComment = async () => {
    if (!commentTask?.id || !newComment.trim()) return;
    await addTaskComment(commentTask.id, newComment, userProfile);
    setNewComment('');
    const rows = await getTaskComments(commentTask.id);
    const lastComment = rows[rows.length - 1] || null;
    setComments(rows);
    setCommentTask((prev) => prev ? {
      ...prev,
      comments: rows,
      comment_count: rows.length,
      last_comment: lastComment,
    } : prev);
    markTaskCommentsRead(commentTask, rows);
    await loadData();
  };

  const handleStartEditComment = (comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.comment || '');
  };

  const handleSaveEditedComment = async () => {
    if (!editingCommentId || !commentTask?.id || !editingCommentText.trim()) return;
    await updateTaskComment(editingCommentId, editingCommentText, userProfile);
    setEditingCommentId(null);
    setEditingCommentText('');
    const rows = await getTaskComments(commentTask.id);
    const lastComment = rows[rows.length - 1] || null;
    setComments(rows);
    setCommentTask((prev) => prev ? {
      ...prev,
      comments: rows,
      comment_count: rows.length,
      last_comment: lastComment,
    } : prev);
    markTaskCommentsRead(commentTask, rows);
    await loadData();
  };

  const handleDeleteComment = async (comment) => {
    if (!comment?.id || !commentTask?.id) return;
    const confirmed = window.confirm(tr('Delete this comment?', 'Supprimer ce commentaire ?'));
    if (!confirmed) return;
    await deleteTaskComment(comment.id);
    if (editingCommentId === comment.id) {
      setEditingCommentId(null);
      setEditingCommentText('');
    }
    const rows = await getTaskComments(commentTask.id);
    const lastComment = rows[rows.length - 1] || null;
    setComments(rows);
    setCommentTask((prev) => prev ? {
      ...prev,
      comments: rows,
      comment_count: rows.length,
      last_comment: lastComment,
    } : prev);
    markTaskCommentsRead(commentTask, rows);
    await loadData();
  };

  const handleViewChange = (viewId) => {
    setAssigneeFilter(null);
    setActiveView(viewId);
  };

  const handleFilterAssignee = (id, name) => {
    if (!id) return;
    setFocusMode(false);
    setActiveView('team');
    setAssigneeFilter({ id: String(id), name: name || tr('Assigned user', 'Utilisateur assigne') });
  };

  const handleShare = async (task) => {
    const taskUrl = `${window.location.origin}/admin/tasks?task=${task.id}`;
    const shortUrl = await shortenUrl(taskUrl, task.id, 'other');
    const message = `New Task: ${task.title}\n${task.assigned_user ? `Assigned to ${task.assigned_user_name || 'team member'}` : 'Open'}\n${shortUrl}\nRef: ${getTaskReference(task)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6 rounded-[2rem] bg-slate-100/80 p-5 sm:p-7">
      <div className="rounded-[1.75rem] border border-slate-100 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">{tr('Tasks', 'Taches')}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-600">
              <span>🔥 {stats.open} {tr('to claim', 'a prendre')}</span>
              <span className="text-slate-300">•</span>
              <span className={stats.urgent > 0 ? 'text-red-600' : ''}>🚨 {stats.urgent} {tr('urgent', 'urgent')}</span>
              <span className="text-slate-300">•</span>
              <span className="text-green-700">✅ {stats.completedToday} {tr('done today', "terminees aujourd'hui")}</span>
            </div>
            {todayLeader && (
              <p className="mt-1 text-sm font-medium text-slate-500">
                🏆 {todayLeader.name} {tr('leading today', "mene aujourd'hui")} ({todayLeader.count})
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleViewChange('open')}
              disabled={stats.open === 0}
              variant="outline"
              className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ⚡ {tr('Claim', 'Prendre')} ({stats.open})
            </Button>
            <Button onClick={() => {
              if (showCreate && !editingTask) {
                setShowCreate(false);
                return;
              }
              resetTaskForm();
              setShowCreate(true);
            }} size="sm" className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700">
              <Plus className="mr-1.5 h-4 w-4" />
              {tr('Create', 'Creer')}
            </Button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {showCreate && editingTask && (
        <button
          type="button"
          aria-label={tr('Close task editor', 'Fermer edition tache')}
          onClick={() => { resetTaskForm(); setShowCreate(false); }}
          className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-sm"
        />
      )}

      {showCreate && (
        <form
          onSubmit={handleCreateTask}
          className={`rounded-[2rem] border border-slate-200 bg-white p-4 ${
            editingTask
              ? 'fixed left-1/2 top-1/2 z-[60] max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto shadow-2xl shadow-slate-950/20'
              : 'shadow-sm'
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-500">{editingTask ? tr('Edit task', 'Modifier tache') : tr('New task', 'Nouvelle tache')}</p>
              <p className="text-sm text-slate-500">{editingTask ? tr('Update the task details and labels.', 'Mettez à jour les détails et étiquettes.') : tr('Create a fast team task.', 'Créez une tâche équipe rapide.')}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => { resetTaskForm(); setShowCreate(false); }} className="rounded-2xl">
              {tr('Cancel', 'Annuler')}
            </Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
            <Input required placeholder={tr('Task title', 'Titre de la tache')} value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
              <label className="mb-1 block px-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                {tr('Assign to', 'Assigner a')}
              </label>
              <select value={form.assigned_user} onChange={(e) => setForm((prev) => ({ ...prev, assigned_user: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
                <option value="">{tr('Leave open to claim', 'Laisser ouverte')}</option>
                {effectiveUsers.map((user) => {
                  const id = userId(user);
                  return id ? <option key={id} value={id}>{userName(user)}</option> : null;
                })}
              </select>
              <p className={`mt-1 px-1 text-xs font-bold ${selectedAssignedUser ? 'text-violet-700' : 'text-slate-500'}`}>
                {selectedAssignedUser
                  ? `${tr('Assigned to', 'Assignee a')} ${userName(selectedAssignedUser)}`
                  : tr('No assignee yet. Anyone can claim this task.', 'Pas encore assignee. Tout le monde peut la prendre.')}
              </p>
              {effectiveUsers.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {effectiveUsers.slice(0, 8).map((user) => {
                    const id = userId(user);
                    const selected = String(form.assigned_user || '') === String(id);
                    return id ? (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, assigned_user: selected ? '' : id }))}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-black transition ${
                          selected
                            ? 'border-violet-600 bg-violet-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'
                        }`}
                      >
                        {selected ? '✓ ' : ''}{userName(user)}
                      </button>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                {tr('Priority', 'Priorite')}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {tr('Task temperature, not a label', 'Importance de la tache, pas une etiquette')}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {priorityOptions.map((option) => {
                const selected = form.priority === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, priority: option.key }))}
                    className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold transition ${
                      selected
                        ? option.selectedClass
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${option.dotClass}`} />
                    {tr(option.label, option.label === 'Medium' ? 'Moyen' : option.label === 'Urgent' ? 'Urgent' : 'Normal')}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3">
            <textarea
              placeholder={tr('Description', 'Description')}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            />
          </div>

          <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{tr('Labels', 'Etiquettes')}</p>
                <p className="text-xs text-slate-500">{tr('Add as many labels as needed. Cards preview the first 5.', 'Ajoutez autant d etiquettes que necessaire. Les cartes affichent les 5 premieres.')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500">{(form.labels || []).length} {tr('labels', 'etiquettes')}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowLabelTools((value) => !value)}
                  className="rounded-2xl bg-white"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  {showLabelTools ? tr('Hide labels', 'Masquer') : tr('Add label', 'Ajouter')}
                </Button>
              </div>
            </div>

            {(form.labels || []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sortTaskLabels(form.labels).map((label) => (
                  <TaskLabel key={label.key} label={label} removable onRemove={() => removeLabel(label.key)} />
                ))}
              </div>
            )}

            {showLabelTools && (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
              {[
                { id: 'vehicle', emoji: '🚗', label: 'Vehicle' },
                { id: 'tour', emoji: '🏍️', label: 'Tour' },
                { id: 'rental', emoji: '📄', label: 'Rental' },
                { id: 'maintenance', emoji: '🔧', label: 'Maintenance' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setActiveLabelSelector((current) => (current === option.id ? null : option.id));
                    setLabelSearch('');
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${activeLabelSelector === option.id ? 'border-violet-600 bg-violet-600 text-white' : 'border-violet-200 bg-white text-violet-800 hover:bg-violet-50'} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span className="mr-1">{option.emoji}</span>{option.label}
                </button>
              ))}
              {reusableInfoLabels.map((label) => (
                <button
                  key={label.key}
                  type="button"
                  disabled={selectedLabelKeys.has(label.key)}
                  onClick={() => addLabel(label)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="mr-1">{label.emoji}</span>{label.text}
                </button>
              ))}
                </div>

                <div className="mt-3 flex flex-col gap-2 rounded-3xl border border-dashed border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
              <Input
                value={customLabelEmoji}
                onChange={(event) => setCustomLabelEmoji(event.target.value)}
                placeholder="🏷️"
                maxLength={4}
                className="sm:w-20"
              />
              <Input
                value={customLabelText}
                onChange={(event) => setCustomLabelText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addCustomLabel();
                  }
                }}
                placeholder={tr('Add custom label text', 'Ajouter une etiquette')}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addCustomLabel}
                disabled={!customLabelText.trim()}
                className="rounded-2xl"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {tr('Add label', 'Ajouter')}
              </Button>
                </div>

                {activeLabelSelector && (
                  <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-3">
                <Input
                  value={labelSearch}
                  onChange={(event) => setLabelSearch(event.target.value)}
                  placeholder={activeLabelSelector === 'vehicle' ? tr('Search plate or model', 'Chercher plaque ou modele') : activeLabelSelector === 'tour' ? tr('Search scheduled tour or guide', 'Chercher tour ou guide') : activeLabelSelector === 'rental' ? tr('Search rental or customer', 'Chercher location ou client') : tr('Search maintenance', 'Chercher maintenance')}
                />
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                  {selectorOptions.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-slate-500">{tr('No matches found.', 'Aucun resultat.')}</p>
                  ) : selectorOptions.map((label) => (
                    <button
                      key={label.key}
                      type="button"
                      disabled={selectedLabelKeys.has(label.key)}
                      onClick={() => {
                        addSelectorLabel(label);
                        setLabelSearch('');
                      }}
                      className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span>{label.emoji}</span>
                      <span>{label.text}</span>
                    </button>
                  ))}
                </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-3 flex justify-end">
            <Button type="submit" className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700">{editingTask ? tr('Update task', 'Mettre à jour') : tr('Save task', 'Enregistrer tache')}</Button>
          </div>
        </form>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="space-y-8">
          <div className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.035)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'my', label: tr('My Tasks', 'Mes taches'), count: stats.my },
                { id: 'team', label: tr('Team Tasks', 'Taches equipe'), count: stats.team },
                { id: 'open', label: tr('Open', 'Ouvertes'), count: stats.open },
                { id: 'urgent', label: tr('Urgent', 'Urgent'), count: stats.urgent },
                { id: 'completed', label: tr('Completed', 'Terminees'), count: stats.completed },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleViewChange(tab.id)}
                  className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                    !assigneeFilter && activeView === tab.id
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : tab.id === 'urgent' && tab.count > 0
                        ? 'border-red-100 bg-white text-red-600 hover:bg-red-50'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab.label} <span className="ml-1 opacity-70">{tab.count}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setAssigneeFilter(null);
                setFocusMode((value) => !value);
              }}
              className={`inline-flex items-center justify-center rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                focusMode
                  ? 'border-violet-200 bg-violet-50 text-violet-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {focusMode ? '👁' : '🙈'} {tr('Focus mode', 'Mode focus')}
            </button>
          </div>

          {activeAssignees.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-[1.5rem] border border-slate-100 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                {tr('People', 'Equipe')}
              </span>
              {activeAssignees.map((person) => {
                const selected = String(assigneeFilter?.id || '') === String(person.id);
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => handleFilterAssignee(person.id, person.name)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold transition ${
                      selected
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-200 hover:text-violet-700'
                    }`}
                  >
                    {person.name} <span className="ml-1 opacity-70">{person.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {assigneeFilter && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-sm text-violet-800">
              <span className="font-semibold">
                {tr('Showing tasks for', 'Taches de')} <span className="font-black">{assigneeFilter.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setAssigneeFilter(null)}
                className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-black text-violet-700 hover:bg-violet-100"
              >
                {tr('Clear', 'Effacer')}
              </button>
            </div>
          )}

          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">{tr('Loading tasks...', 'Chargement des taches...')}</div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <Circle className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 font-semibold text-slate-800">{tr('No tasks here', 'Aucune tache ici')}</p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const lastComment = getTaskLastComment(task);
              const hasUnreadComments = taskHasUnreadComments(task);
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  currentUser={userProfile}
                  assigneeName={userName(usersById.get(String(task.assigned_user || '')))}
                  highlighted={String(task.id) === String(highlightedTaskId)}
                  commentCount={getTaskCommentCount(task)}
                  hasUnreadComments={hasUnreadComments}
                  lastComment={lastComment}
                  onClaim={async (row) => { await claimTask(row, userProfile); await loadData(); }}
                  onDone={async (row) => {
                    await markTaskDone(row.id, userProfile);
                    toast.success('+1 task completed ✅');
                    await loadData();
                  }}
                  onEdit={handleEditTask}
                  onDelete={handleDeleteTask}
                  onShare={handleShare}
                  onUnclaim={async (row) => { await unclaimTask(row, userProfile); await loadData(); }}
                  onOpenComments={handleOpenComments}
                  onFilterAssignee={handleFilterAssignee}
                  onToggleLabelDone={handleToggleLinkedLabelDone}
                />
              );
            })
          )}
        </main>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-slate-500" />
              <h2 className="font-bold text-slate-900">{tr('Monthly leaderboard', 'Classement mensuel')}</h2>
            </div>
            <div className="mt-4 space-y-2">
              {leaderboard.length === 0 ? (
                <p className="text-sm text-slate-500">{tr('No completed tasks this month yet.', 'Aucune tache terminee ce mois-ci.')}</p>
              ) : leaderboard.map((row, index) => (
                <div key={row.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-800">#{index + 1} {row.name}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-violet-700">{row.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-violet-500" />
              <h2 className="font-black text-slate-900">{tr('Notifications', 'Notifications')}</h2>
            </div>
            <div className="mt-4 space-y-2">
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500">{tr('No task notifications.', 'Aucune notification de tache.')}</p>
              ) : notifications.map((notification) => (
                <div key={notification.id} className="rounded-2xl bg-violet-50 px-3 py-2 text-sm text-violet-800">
                  <p className="font-bold">
                    {String(notification.title || '').toLowerCase().includes('comment') ? '💬 ' : ''}
                    {notification.task_id ? `${getTaskReference({ id: notification.task_id })} • ` : ''}{notification.title}
                  </p>
                  <p className="whitespace-pre-line text-xs">{notification.message}</p>
                  {notification.task_id && (
                    <Link to={`/admin/tasks?task=${notification.task_id}`} className="mt-1 inline-flex text-xs font-black text-violet-700 hover:text-violet-900">
                      {tr('Open task', 'Ouvrir la tache')}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {commentTask && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
          role="presentation"
          onMouseDown={() => setCommentTask(null)}
        >
          <aside
            className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-500">{tr('Task conversation', 'Conversation tache')}</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">{commentTask.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {comments.length} {comments.length === 1 ? tr('comment', 'commentaire') : tr('comments', 'commentaires')}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setCommentTask(null)} className="rounded-2xl">
                  {tr('Close', 'Fermer')}
                </Button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-5">
              {comments.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-center">
                  <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-500">{tr('No comments yet.', 'Aucun commentaire.')}</p>
                </div>
              ) : comments.map((comment) => {
                const isMine = String(comment.created_by || '') === String(userProfile?.id || '');
                return (
                  <div key={comment.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[86%] rounded-3xl border px-4 py-3 ${
                      isMine
                        ? 'border-violet-200 bg-violet-600 text-white shadow-sm shadow-violet-100'
                        : 'border-slate-200 bg-white text-slate-800'
                    }`}>
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`font-black ${isMine ? 'text-violet-100' : 'text-slate-700'}`}>{comment.created_by_name || 'Team'}</span>
                        <span className={isMine ? 'text-violet-100/80' : 'text-slate-400'}>{new Date(comment.created_at).toLocaleString()}</span>
                        {isMine && editingCommentId !== comment.id && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartEditComment(comment)}
                              className={`font-black underline-offset-2 hover:underline ${isMine ? 'text-violet-100' : 'text-violet-700'}`}
                            >
                              {tr('Edit', 'Modifier')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment)}
                              className="font-black text-red-100 underline-offset-2 hover:text-white hover:underline"
                            >
                              {tr('Delete', 'Supprimer')}
                            </button>
                          </>
                        )}
                      </div>
                      {editingCommentId === comment.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingCommentText}
                            onChange={(event) => setEditingCommentText(event.target.value)}
                            className="min-h-20 w-full rounded-2xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditingCommentText('');
                              }}
                              className="rounded-2xl bg-white text-slate-700"
                            >
                              {tr('Cancel', 'Annuler')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleSaveEditedComment}
                              disabled={!editingCommentText.trim()}
                              className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700"
                            >
                              {tr('Save', 'Enregistrer')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-line text-sm leading-relaxed">{comment.comment}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-100 bg-white p-4">
              <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleAddComment();
                    }
                  }}
                  placeholder={tr('Quick reply...', 'Reponse rapide...')}
                />
                <Button onClick={handleAddComment} className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700">
                  {tr('Reply', 'Repondre')}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default Tasks;
