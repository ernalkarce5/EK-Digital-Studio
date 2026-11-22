import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ExternalLink, FolderKanban, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { AdminPageHeader, IconButton, PublishBadge } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { Badge, ProjectTypeBadge } from '@/components/common/Badge';
import { SmartImage } from '@/components/common/SmartImage';
import { ConfirmDialog } from '@/components/common/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { deleteProject, listAllProjects, saveProjectOrder, updateProject } from '@/services/projects';
import { toErrorMessage } from '@/lib/errors';
import { cn, formatDate } from '@/lib/utils';
import type { ProjectWithCategory } from '@/types/database';

type StatusFilter = 'all' | 'published' | 'draft';

export default function ProjectsAdminPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as StatusFilter) || 'all';
  const [query, setQuery] = useState('');
  const { data, loading, error, reload, setData } = useAsync(listAllProjects, []);
  const [toDelete, setToDelete] = useState<ProjectWithCategory | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const projects = useMemo(() => data ?? [], [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(
      (p) =>
        (status === 'all' || p.status === status) &&
        (!q || `${p.title} ${p.slug} ${p.category?.name ?? ''}`.toLowerCase().includes(q)),
    );
  }, [projects, status, query]);
  const canReorder = status === 'all' && !query;

  const toggleFeatured = async (p: ProjectWithCategory) => {
    setBusy(p.id);
    try {
      await updateProject(p.id, { is_featured: !p.is_featured });
      setData((list) => list?.map((x) => (x.id === p.id ? { ...x, is_featured: !p.is_featured } : x)));
      toast.success(p.is_featured ? 'Removed from featured.' : 'Marked as featured.');
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const togglePublish = async (p: ProjectWithCategory) => {
    const next = p.status === 'published' ? 'draft' : 'published';
    setBusy(p.id);
    try {
      await updateProject(p.id, { status: next });
      setData((list) => list?.map((x) => (x.id === p.id ? { ...x, status: next } : x)));
      toast.success(next === 'published' ? 'Project published.' : 'Project moved to drafts.');
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const move = async (index: number, delta: number) => {
    const next = [...projects];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setData(() => next.map((p, i) => ({ ...p, display_order: i * 10 })));
    try {
      await saveProjectOrder(next.map((p) => p.id));
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not save the new order.'));
      reload();
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(toDelete.id);
    try {
      await deleteProject(toDelete.id);
      setData((list) => list?.filter((x) => x.id !== toDelete.id));
      toast.success(`“${toDelete.title}” deleted.`);
      setToDelete(null);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Projects"
        description="Create, publish and order portfolio projects. Drafts are never visible on the public site."
        actions={
          <Button to="/admin/projects/new" icon={Plus} size="sm">
            New project
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border border-line p-1" role="tablist" aria-label="Filter by status">
          {(['all', 'published', 'draft'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => setParams(s === 'all' ? {} : { status: s }, { replace: true })}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm capitalize transition-colors',
                status === s ? 'bg-card text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {s} <span className="ml-1 font-mono text-[11px] text-subtle">{s === 'all' ? projects.length : projects.filter((p) => p.status === s).length}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="h-10 w-full rounded-lg border border-line-strong bg-bg-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !projects.length ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Add your first project. Mark demo work as a Demo Project so visitors know what it is."
          action={
            <Button to="/admin/projects/new" icon={Plus} size="sm">
              New project
            </Button>
          }
        />
      ) : !filtered.length ? (
        <EmptyState icon={Search} title="No projects match" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {filtered.map((p) => {
            const index = projects.findIndex((x) => x.id === p.id);
            return (
              <li key={p.id} className={cn('flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4', busy === p.id && 'opacity-60')}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <SmartImage path={p.cover_image_path} alt="" className="h-14 w-20 shrink-0 rounded-md border border-line" />
                  <div className="min-w-0">
                    <Link to={`/admin/projects/${p.id}`} className="block truncate font-medium hover:text-accent-2">
                      {p.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <PublishBadge published={p.status === 'published'} />
                      <ProjectTypeBadge type={p.project_type} />
                      {p.is_featured && (
                        <Badge tone="accent">
                          <Star className="size-3 fill-current" aria-hidden /> Featured
                        </Badge>
                      )}
                      <span>{p.category?.name ?? 'Uncategorized'}</span>
                      <span className="text-subtle">· updated {formatDate(p.updated_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 self-end sm:self-auto">
                  {canReorder && (
                    <>
                      <IconButton label="Move up" onClick={() => void move(index, -1)} disabled={index === 0 || !!busy}>
                        <ArrowUp className="size-4" />
                      </IconButton>
                      <IconButton label="Move down" onClick={() => void move(index, 1)} disabled={index === projects.length - 1 || !!busy}>
                        <ArrowDown className="size-4" />
                      </IconButton>
                    </>
                  )}
                  <IconButton
                    label={p.is_featured ? 'Remove from featured' : 'Mark as featured'}
                    tone={p.is_featured ? 'active' : 'default'}
                    onClick={() => void toggleFeatured(p)}
                    disabled={!!busy}
                  >
                    <Star className={cn('size-4', p.is_featured && 'fill-current')} />
                  </IconButton>
                  {/* Fixed width + reserved link slot keep the icons aligned across rows. */}
                  <Button size="sm" variant="ghost" className="w-24" onClick={() => void togglePublish(p)} disabled={!!busy}>
                    {p.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                  {p.status !== 'published' && <span className="size-9" aria-hidden />}
                  {p.status === 'published' && (
                    <a
                      href={`/projects/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid size-9 place-items-center rounded-lg text-muted hover:bg-fg/5 hover:text-fg"
                      aria-label="View on website"
                      title="View on website"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                  <Link
                    to={`/admin/projects/${p.id}`}
                    className="grid size-9 place-items-center rounded-lg text-muted hover:bg-fg/5 hover:text-fg"
                    aria-label={`Edit ${p.title}`}
                    title="Edit"
                  >
                    <Pencil className="size-4" />
                  </Link>
                  <IconButton label={`Delete ${p.title}`} tone="danger" onClick={() => setToDelete(p)} disabled={!!busy}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete project?"
        message={
          <>
            <strong className="text-fg">{toDelete?.title}</strong> will be permanently deleted. Its images stay in the
            Media Library and can be removed there.
          </>
        }
        busy={!!toDelete && busy === toDelete.id}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
